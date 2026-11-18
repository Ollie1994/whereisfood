import { randomUUID } from "node:crypto";
import { globSync } from "node:fs";
import { NextResponse, NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readJson, withAdmin } from "@/lib/http/admin";
import { enrollFactor } from "@/lib/mfa";
import { SESSION_MAX_AGE_MS, mfaStepAllowed, requireAdmin } from "@/lib/services/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { createSessionClient, readOnlyCookies } from "@/lib/supabase-session";
import { proxy } from "@/proxy";
import { payloadOf } from "../jwt";
import { totp } from "../totp";
import {
  SIGN_IN_TIMEOUT,
  accepted,
  anonClient,
  authClock,
  cookieHeader,
  createFixtureAuthUser,
  editSessionCookie,
  SESSION_COOKIE,
  jarClient,
  localSql,
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
// call them, at `now` (by default the time now).
const input = (jar: Map<string, string>, now = new Date()) => ({ cookieNames: [...jar.keys()], auth: jarClient(jar).auth, now });

// The user's one verified factor's id, as Auth lists it.
async function verifiedFactor(userId: string): Promise<string> {
  const { data, error } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId });
  if (error) throw error;
  const ids = data.factors.filter((factor) => factor.status === "verified").map((factor) => factor.id);
  if (ids.length !== 1) throw new Error(`verifiedFactor: ${ids.length} verified factors`);
  return ids[0];
}

// The jar's session cookie alone, with its access token's payload edited and its signature
// kept: a claim Auth never signed (#11).
function forged(jar: Map<string, string>, edit: (claims: Record<string, unknown>) => void): Map<string, string> {
  const edited = editSessionCookie(jar, (session) => {
    const [header, , signature] = session.access_token.split(".");
    const claims = payloadOf(session.access_token);
    edit(claims);
    session.access_token = [header, Buffer.from(JSON.stringify(claims)).toString("base64url"), signature].join(".");
  });
  return new Map([...edited].filter(([name]) => SESSION_COOKIE.test(name)));
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

    // `getUser(token)`'s `AuthSessionMissingError` clears the session from storage, so the
    // proxy's redirect deletes the cookies with no signOut of the app's.
    const page = await proxy(get("/admin", cookieHeader(loggedOut.jar)));
    expect(new URL(page.headers.get("location") ?? "").pathname).toBe("/admin/login");
    const deleted = page.headers.getSetCookie().filter((line) => {
      const [name, value] = line.split(";")[0].split("=");
      return SESSION_COOKIE.test(name) && value === "";
    });
    expect(deleted.length).toBeGreaterThan(0);
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
    expect(await mfaStepAllowed(input(enrolledAal1.jar))).toEqual({ ok: true, step: "code", factorId: await verifiedFactor(enrolled.userId) });

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

    const prepared = await enrollFactor(client.auth.mfa);
    if (!prepared || prepared === "expired") throw new Error(`enrollFactor answered ${prepared}`);
    expect(prepared.qrCode).toMatch(/^data:image\/svg\+xml/);
    expect(prepared.factorId).not.toBe(abandoned.data?.id);
    const { data: factors } = await client.auth.mfa.listFactors();
    expect(factors?.all.map((factor) => factor.id)).toEqual([prepared.factorId]);

    const { error } = await client.auth.mfa.challengeAndVerify({
      factorId: prepared.factorId,
      code: totp(prepared.secret, await authClock()),
    });
    expect(error).toBeNull();
    expect(await requireAdmin(input(fresh.jar))).toEqual({ ok: true, userId: fresh.userId });
    expect(await mfaStepAllowed(input(fresh.jar))).toEqual({ ok: false, reason: "done" });
  });
});

// The time-box (Phase 9 plan step 6, #4), on real sessions: a session's first-factor sign-in
// is moved back at Auth (`ageSignIn`), its token refreshed, and the check run with `now` on
// Auth's clock (`authClock`), so a host clock ahead of the Docker VM's doesn't count into the
// age. Moving `now` on instead would read as Auth's clock running behind, which
// `admin-auth.ts` holds within the token's `exp`. Only the refused session is signed out at
// Auth.
describe("the time-box", () => {
  let old: { userId: string; jar: Map<string, string>; accessToken: string };
  let other: { jar: Map<string, string>; accessToken: string };
  let aal1: { jar: Map<string, string>; accessToken: string };

  beforeAll(async () => {
    old = await sessionUser({ isAdmin: true, aal2: true });
    other = await sessionFor(old.userId, { aal2: true });
    // After the `aal2` verifies, which end the user's `aal1` sessions (helpers' `sessionFor`).
    aal1 = await sessionFor(old.userId);
  }, SIGN_IN_TIMEOUT);

  // The first factor's sign-in, in epoch milliseconds, from the token's `amr`.
  function signedIn(accessToken: string): number {
    const { amr } = payloadOf(accessToken);
    const link = (amr as { method: string; timestamp: number }[]).find(({ method }) => method === "magiclink");
    if (!link) throw new Error(`signedIn: no magiclink entry in ${JSON.stringify(amr)}`);
    return link.timestamp * 1000;
  }

  // Moves the session's magic-link sign-in `seconds` back in `auth.mfa_amr_claims`
  // (`localSql`), then refreshes the jar's token, whose `amr` claim Auth builds from that row
  // (the first test reads the moved timestamp back). Returns the new access token.
  async function ageSignIn(session: { jar: Map<string, string>; accessToken: string }, seconds: number): Promise<string> {
    const sessionId = payloadOf(session.accessToken).session_id;
    if (typeof sessionId !== "string" || !/^[0-9a-f-]{36}$/.test(sessionId)) throw new Error("ageSignIn: no session_id");
    const aged = localSql(
      `with aged as (update auth.mfa_amr_claims set created_at = created_at - interval '${seconds} seconds', ` +
        `updated_at = updated_at - interval '${seconds} seconds' where session_id = '${sessionId}' ` +
        `and authentication_method = 'magiclink' returning 1) select count(*) from aged;`,
    );
    if (aged !== "1") throw new Error(`ageSignIn: ${aged} rows aged`);
    const { data, error } = await jarClient(session.jar).auth.refreshSession();
    if (error || !data.session) throw error ?? new Error("ageSignIn: no session after the refresh");
    return data.session.access_token;
  }

  it("lets the session through ten minutes before 12 hours, then refuses it at 12 and signs it out at Auth, refresh token included, and no other session", async () => {
    const fresh = signedIn(old.accessToken);
    let token = await ageSignIn(old, SESSION_MAX_AGE_MS / 1000 - 600);
    expect(signedIn(token)).toBe(fresh - SESSION_MAX_AGE_MS + 600_000);
    expect(await requireAdmin(input(old.jar, new Date(await authClock())))).toEqual({ ok: true, userId: old.userId });

    token = await ageSignIn({ jar: old.jar, accessToken: token }, 600);
    const { data } = await jarClient(old.jar).auth.getSession();
    const refreshToken = data.session?.refresh_token;
    if (!refreshToken) throw new Error("no refresh token in the jar");

    expect(await requireAdmin(input(old.jar, new Date(await authClock())))).toEqual({ ok: false, reason: "no-session" });

    expect(await accepted(token)).toBe(false);
    expect((await anonClient().auth.refreshSession({ refresh_token: refreshToken })).error).not.toBeNull();

    // `scope: "local"`: the same admin's other session still passes.
    expect(await accepted(other.accessToken)).toBe(true);
    expect(await requireAdmin(input(other.jar, new Date(await authClock())))).toEqual({ ok: true, userId: old.userId });
  });

  // The box is in `verify`, so the MFA page's check holds it too (plan step 6), on the page's
  // own `readOnlyCookies`, as `page.tsx` builds its client: the sign-out still ends the session
  // at Auth, and the cookie is left (`admin-auth.ts`'s limit).
  it("refuses an aal1 session the code step at 12 hours on read-only cookies, and signs it out at Auth", async () => {
    const pageInput = async () => ({
      cookieNames: [...aal1.jar.keys()],
      auth: createSessionClient(readOnlyCookies({ getAll: () => [...aal1.jar].map(([name, value]) => ({ name, value })) })).auth,
      now: new Date(await authClock()),
    });
    expect(await mfaStepAllowed(await pageInput())).toEqual({ ok: true, step: "code", factorId: await verifiedFactor(old.userId) });

    const token = await ageSignIn(aal1, SESSION_MAX_AGE_MS / 1000);
    const { data } = await jarClient(aal1.jar).auth.getSession();
    const refreshToken = data.session?.refresh_token;
    if (!refreshToken) throw new Error("no refresh token in the jar");
    const before = [...aal1.jar.keys()];

    expect(await mfaStepAllowed(await pageInput())).toEqual({ ok: false, reason: "no-session" });

    expect(await accepted(token)).toBe(false);
    expect((await anonClient().auth.refreshSession({ refresh_token: refreshToken })).error).not.toBeNull();
    expect([...aal1.jar.keys()]).toEqual(before);
    expect(before.some((name) => SESSION_COOKIE.test(name))).toBe(true);
  });
});
