import { randomUUID } from "node:crypto";
import { globSync } from "node:fs";
import { NextResponse, NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readJson, withAdmin } from "@/lib/http/admin";
import { prepareFactor } from "@/lib/mfa";
import { mfaStepAllowed, requireAdmin } from "@/lib/services/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { proxy } from "@/proxy";
import { totp } from "../totp";
import {
  SIGN_IN_TIMEOUT,
  accepted,
  authClock,
  cookieHeader,
  createFixtureAuthUser,
  jarClient,
  resetTables,
  sessionFor,
  sessionUser,
} from "./helpers";

// Every admin route refuses anyone but the admin at `aal2` with the magic link as the first
// factor (Phase 7 plan, #13; Phase 9 plan step 5b, #11, #14). The routes are FOUND
// ON DISK, not listed: a route added under `src/app/api/admin/` is covered with no edit
// here. Each exported method is called as Next would, with a request and its params.
//
// The sessions sign in once, in `beforeAll` (`helpers.ts`, `signInByLink`: once per file
// or describe).

const ORIGIN = "http://127.0.0.1:3000";
const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;

type Handler = (request: NextRequest, context: { params: Promise<Record<string, string>> }) => Promise<Response>;

// `src/app/api/admin/trucks/[id]/route.ts` → its import path, and a params object with a
// fresh uuid for each `[segment]`.
const ROUTES = globSync("src/app/api/admin/**/route.ts").map((file) => {
  const path = file.replaceAll("\\", "/");
  const params = Object.fromEntries([...path.matchAll(/\[([^\]]+)\]/g)].map(([, name]) => [name, randomUUID()]));
  return { path, importPath: `@/${path.slice("src/".length, -".ts".length)}`, params };
});

function request(method: string, cookie: string) {
  const headers: Record<string, string> = { host: "127.0.0.1:3000", origin: ORIGIN, "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  const body = method === "GET" || method === "HEAD" ? undefined : "{}";
  return new NextRequest(`${ORIGIN}/api/admin/test`, { method, headers, body });
}

const NO_SESSION = "Du är inte inloggad";
const NEEDS_MFA = "Ange koden från din autentiseringsapp för att fortsätta";

const sessions: Record<string, string> = {};

beforeAll(async () => {
  await resetTables();
  sessions["no session cookie"] = "";
  sessions["a session cookie that isn't a session"] = "sb-127-auth-token=base64-bm90IGEgc2Vzc2lvbg";
  sessions["a non-admin"] = cookieHeader((await sessionUser()).jar);
  sessions["an auth user with no users row"] = cookieHeader((await sessionFor(await createFixtureAuthUser())).jar);
  sessions["an aal1 admin"] = cookieHeader((await sessionUser({ isAdmin: true })).jar);
  sessions.admin = cookieHeader((await sessionUser({ isAdmin: true, aal2: true })).jar);
}, SIGN_IN_TIMEOUT);
afterAll(resetTables);

describe("the admin routes on disk", () => {
  it("finds at least GET /api/admin/trucks, and every route exports a method", async () => {
    expect(ROUTES.map((route) => route.path)).toContain("src/app/api/admin/trucks/route.ts");
    for (const { importPath } of ROUTES) {
      const exports = await import(importPath);
      expect(METHODS.some((method) => typeof exports[method] === "function"), importPath).toBe(true);
    }
  });
});

describe.each(ROUTES)("$path", ({ importPath, params }) => {
  // The 401s name their reason, so an `aal1` session can't pass for "no session" (plan, open
  // decision 6).
  it.each([
    ["no session cookie", 401, NO_SESSION],
    ["a session cookie that isn't a session", 401, NO_SESSION],
    ["a non-admin", 403, expect.any(String)],
    ["an auth user with no users row", 403, expect.any(String)],
    ["an aal1 admin", 401, NEEDS_MFA],
  ])("answers every exported method with %s as %i { error }, no-store", async (who, status, error) => {
    const exports = (await import(importPath)) as Partial<Record<(typeof METHODS)[number], Handler>>;
    for (const method of METHODS) {
      const handler = exports[method];
      if (!handler) continue;

      const response = await handler(request(method, sessions[who]), { params: Promise.resolve(params) });

      expect(response.status, method).toBe(status);
      expect(response.headers.get("cache-control"), method).toBe("no-store");
      if (method !== "HEAD") expect(await response.json(), method).toEqual({ error });
    }
  });
});

// A write behind `withAdmin`, through a throwaway handler that echoes the admin's id and
// body, so the origin and JSON checks are tested apart from any route's own work (#223's
// failure modes). The location writes' own cases are `api-admin-locations.test.ts`'s.
describe("a write through withAdmin, on the admin's session", () => {
  const write = (request: NextRequest) =>
    withAdmin(request, async (adminId) => {
      const json = await readJson(request);
      if (!json.ok) return json.response;
      return NextResponse.json({ adminId, body: json.body });
    });

  function post(origin: string | null, body = '{"a":1}') {
    const headers: Record<string, string> = { host: "127.0.0.1:3000", cookie: sessions.admin };
    if (origin) headers.origin = origin;
    return new NextRequest(`${ORIGIN}/api/admin/test`, { method: "POST", headers, body });
  }

  it("reaches the handler from this origin, with the admin's id", async () => {
    const response = await write(post(ORIGIN));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ adminId: expect.any(String), body: { a: 1 } });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it.each([
    ["a foreign Origin", "https://evil.example"],
    ["no Origin", null],
  ])("refuses %s with 403 { error }", async (_, origin) => {
    const response = await write(post(origin));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: expect.any(String) });
  });

  it("answers a body that isn't JSON with 400 and a Swedish message", async () => {
    const response = await write(post(ORIGIN, "{not json"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Begärans innehåll är inte giltig JSON" });
  });
});

// The request a route or the proxy gets, with `cookie`.
function get(path: string, cookie: string) {
  return new NextRequest(`${ORIGIN}${path}`, { headers: { host: "127.0.0.1:3000", cookie } });
}

// `requireAdmin` and `mfaStepAllowed` on a jar's session, as `withAdmin` and the MFA page
// call them.
const input = (jar: Map<string, string>) => ({ cookieNames: [...jar.keys()], auth: jarClient(jar).auth });

// The session `@supabase/ssr` keeps in one cookie (`base64-` and its JSON), with its access
// token's payload edited and its signature kept: a claim Auth never signed (#11).
function forged(jar: Map<string, string>, edit: (claims: Record<string, unknown>) => void): Map<string, string> {
  const cookies = [...jar].filter(([name]) => /^sb-.+-auth-token$/.test(name));
  expect(cookies, "one unchunked session cookie").toHaveLength(1);
  const [name, value] = cookies[0];
  const session = JSON.parse(Buffer.from(value.replace(/^base64-/, ""), "base64url").toString("utf8"));
  const [header, payload, signature] = session.access_token.split(".");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  edit(claims);
  session.access_token = [header, Buffer.from(JSON.stringify(claims)).toString("base64url"), signature].join(".");
  return new Map([[name, `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`]]);
}

// The first factor and the second (Phase 9 plan step 5b, #14), on real sessions. A refused
// first factor is signed out at Auth: `accepted` asks Auth afterwards.
describe("the first factor and the second", () => {
  type Session = { userId?: string; jar: Map<string, string>; accessToken: string };
  let enrolled: Session & { userId: string };
  let passwordAal2: Session;
  let loggedOut: Session;
  let enrolledAal1: Session;
  let otpAtRoute: Session;
  let otpAtPage: Session;
  let fresh: Session & { userId: string };

  beforeAll(async () => {
    enrolled = await sessionUser({ isAdmin: true, aal2: true });
    // A password login raised to `aal2` with the admin's own factor: `amr` [password, totp].
    passwordAal2 = await sessionFor(enrolled.userId, { aal2: true, firstFactor: "password" });
    loggedOut = await sessionFor(enrolled.userId, { aal2: true });
    // After the `aal2` verifies, which end the user's `aal1` sessions (helpers' `sessionFor`).
    enrolledAal1 = await sessionFor(enrolled.userId);
    otpAtRoute = await sessionUser({ isAdmin: true, firstFactor: "otp" });
    otpAtPage = await sessionUser({ isAdmin: true, firstFactor: "otp" });
    fresh = await sessionUser({ isAdmin: true });
  }, SIGN_IN_TIMEOUT);

  const trucks = async (cookie: string) => {
    const { GET } = await import("@/app/api/admin/trucks/route");
    return GET(get("/api/admin/trucks", cookie));
  };

  it("lets an aal2 magic-link admin through", async () => {
    expect((await trucks(cookieHeader(enrolled.jar))).status).toBe(200);
  });

  it.each([
    ["a password login at aal2", () => passwordAal2],
    ["a directly verified code's session (otp)", () => otpAtRoute],
  ])("refuses %s as no session, and signs it out at Auth", async (_, session) => {
    const { jar, accessToken } = session();
    expect(await accepted(accessToken)).toBe(true);

    const response = await trucks(cookieHeader(jar));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: NO_SESSION });
    expect(await accepted(accessToken)).toBe(false);
  });

  // Its token is still unexpired and correctly signed; only Auth knows the session is gone.
  it("refuses an aal2 admin session that was logged out at Auth", async () => {
    expect((await trucks(cookieHeader(loggedOut.jar))).status).toBe(200);
    await supabaseAdmin.auth.admin.signOut(loggedOut.accessToken, "local");

    const response = await trucks(cookieHeader(loggedOut.jar));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: NO_SESSION });
  });

  // Read from the cookie, this would pass as `aal2`; Auth refuses the signature instead.
  it("refuses a forged aal2 claim as no session", async () => {
    const jar = forged(enrolledAal1.jar, (claims) => {
      claims.aal = "aal2";
      claims.amr = [...(claims.amr as object[]), { method: "totp", timestamp: Math.floor(Date.now() / 1000) }];
    });

    expect(await requireAdmin(input(jar))).toEqual({ ok: false, reason: "no-session" });
    const response = await trucks(cookieHeader(jar));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: NO_SESSION });
  });

  it("gives an enrolled admin's aal1 session the code step, and Auth refuses it a second factor", async () => {
    expect(await mfaStepAllowed(input(enrolledAal1.jar))).toEqual({ ok: true, step: "code" });

    // Named: an unnamed one beside the fixture's unnamed factor is refused
    // `mfa_factor_name_conflict` first (local stack, the PR for IS #382).
    const { error } = await jarClient(enrolledAal1.jar).auth.mfa.enroll({ factorType: "totp", friendlyName: "second" });
    expect(error?.code).toBe("too_many_enrolled_mfa_factors");
  });

  it("refuses the MFA page to an otp session and signs it out (the allowlist, plan #14)", async () => {
    expect(await accepted(otpAtPage.accessToken)).toBe(true);

    const response = await proxy(get("/admin/mfa", cookieHeader(otpAtPage.jar)));

    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/admin/login");
    expect(await accepted(otpAtPage.accessToken)).toBe(false);
  });

  it("lets a new admin's aal1 session reach the enroll, past an abandoned one, through to aal2", async () => {
    const client = jarClient(fresh.jar);
    const abandoned = await client.auth.mfa.enroll({ factorType: "totp" });
    expect(abandoned.error).toBeNull();
    expect(await mfaStepAllowed(input(fresh.jar))).toEqual({ ok: true, step: "enroll" });
    expect((await proxy(get("/admin/mfa", cookieHeader(fresh.jar)))).headers.get("x-middleware-next")).toBe("1");

    const prepared = await prepareFactor(client.auth.mfa, "enroll");
    expect(prepared?.qrCode).toMatch(/^data:image\/svg\+xml/);
    expect(prepared?.factorId).not.toBe(abandoned.data?.id);
    const { data: factors } = await client.auth.mfa.listFactors();
    expect(factors?.all.map((factor) => factor.id)).toEqual([prepared?.factorId]);

    const { error } = await client.auth.mfa.challengeAndVerify({
      factorId: prepared!.factorId,
      code: totp(prepared!.secret!, await authClock()),
    });
    expect(error).toBeNull();
    expect(await requireAdmin(input(fresh.jar))).toEqual({ ok: true, userId: fresh.userId });
    expect(await mfaStepAllowed(input(fresh.jar))).toEqual({ ok: false, reason: "done" });
  });
});
