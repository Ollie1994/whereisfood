import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as callback } from "@/app/auth/callback/route";
import { POST as logout } from "@/app/auth/logout/route";
import { supabaseAdmin } from "@/lib/supabase";
import {
  FIXTURE_PREFIX,
  anonClient,
  authUserIdsWhere,
  cookieHeader,
  createFixtureAuthUser,
  fixtureEmail,
  jarClient,
  resetTables,
  sessionFor,
  sessionUser,
} from "./helpers";

// `/auth/callback` and `/auth/logout` against the local stack (Phase 7 plan, step 2).
// Each `sessionUser`/`sessionFor` is a sign-in, under local Auth's limit (`helpers.ts`,
// `signedInClient`).

const ORIGIN = "http://127.0.0.1:3000";
// Mailpit, the local stack's mail catcher: `supabase/config.toml`, `[local_smtp]`'s port.
const MAILPIT = "http://127.0.0.1:54324";
const SESSION_COOKIE = /^sb-[^=]+-auth-token(\.\d+)?$/;

function request(path: string, { method = "GET", cookie = "", origin = ORIGIN as string | null } = {}) {
  const headers: Record<string, string> = { host: "127.0.0.1:3000" };
  if (cookie) headers.cookie = cookie;
  if (origin) headers.origin = origin;
  return new NextRequest(`${ORIGIN}${path}`, { method, headers });
}

// The response's `Set-Cookie` lines as name → value; a cleared cookie has value "".
function setCookies(response: Response): Map<string, string> {
  return new Map(
    response.headers.getSetCookie().map((line) => {
      const [pair] = line.split(";");
      const i = pair.indexOf("=");
      return [pair.slice(0, i), pair.slice(i + 1)];
    }),
  );
}

function sessionCookieNames(cookies: Map<string, string>): string[] {
  return [...cookies.keys()].filter((name) => SESSION_COOKIE.test(name));
}

// Does Auth still accept this access token? `getUser` asks the server, which checks the
// token's session still exists.
async function accepted(accessToken: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  return !error && data.user !== null;
}

// The newest sign-in link Mailpit holds for `email`.
async function emailedLink(email: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const search = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    const { messages } = (await search.json()) as { messages: { ID: string }[] };
    if (messages.length > 0) {
      const message = await (await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json();
      const link = String(message.HTML ?? message.Text).match(/https?:\/\/[^"'\s<>]+\/verify\?[^"'\s<>]+/);
      if (!link) throw new Error(`emailedLink: no verify link in the mail to ${email}`);
      return link[0].replaceAll("&amp;", "&");
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`emailedLink: no mail to ${email} in Mailpit`);
}

beforeAll(resetTables);
afterAll(resetTables);

describe("sign-ups are off ([auth] enable_signup = false)", () => {
  it("refuses an unknown email asking for a link, and creates no auth user", async () => {
    const email = `${FIXTURE_PREFIX}nobody-${randomUUID()}@example.test`;
    const { error } = await anonClient().auth.signInWithOtp({ email, options: { shouldCreateUser: true } });

    expect(error?.code).toBe("signup_disabled");
    expect(await authUserIdsWhere((e) => e === email)).toEqual([]);
  });

  it("refuses a password sign-up, and creates no auth user", async () => {
    const email = `${FIXTURE_PREFIX}nobody-${randomUUID()}@example.test`;
    const { error } = await anonClient().auth.signUp({ email, password: "itest-signup-password" });

    expect(error?.code).toBe("signup_disabled");
    expect(await authUserIdsWhere((e) => e === email)).toEqual([]);
  });
});

describe("GET /auth/callback", () => {
  let userId: string;
  let code: string;
  let verifierJar: Map<string, string>;

  // One real emailed link: the browser's side of the login (`useLogin`) through a jar.
  beforeAll(async () => {
    userId = await createFixtureAuthUser();
    verifierJar = new Map();
    const { error } = await jarClient(verifierJar).auth.signInWithOtp({
      email: fixtureEmail(userId),
      options: { shouldCreateUser: false, emailRedirectTo: `${ORIGIN}/auth/callback` },
    });
    if (error) throw error;

    const verify = await fetch(await emailedLink(fixtureEmail(userId)), { redirect: "manual" });
    const location = new URL(verify.headers.get("location") ?? "");
    expect(`${location.origin}${location.pathname}`).toBe(`${ORIGIN}/auth/callback`);
    code = location.searchParams.get("code") ?? "";
    expect(code).not.toBe("");
  });

  // #224's phone failure: the link opened in a browser without the verifier cookie. Before
  // the exchange test, which then shows the code wasn't spent.
  it("sends a code with no verifier cookie back with ?error=browser and no session", async () => {
    const response = await callback(request(`/auth/callback?code=${code}`));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin/login?error=browser");
    const written = setCookies(response);
    expect(sessionCookieNames(written).filter((name) => written.get(name) !== "")).toEqual([]);
  });

  it("exchanges the code, writes a session cookie Auth accepts, and lands on /admin", async () => {
    const response = await callback(request(`/auth/callback?code=${code}`, { cookie: cookieHeader(verifierJar) }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin");

    const written = setCookies(response);
    const names = sessionCookieNames(written).filter((name) => written.get(name) !== "");
    expect(names.length).toBeGreaterThan(0);

    const jar = new Map(names.map((name) => [name, written.get(name) as string]));
    const { data } = await jarClient(jar).auth.getUser();
    expect(data.user?.id).toBe(userId);
  });

  it("sends a used code back to the login with ?error=link and no session", async () => {
    const response = await callback(request(`/auth/callback?code=${code}`, { cookie: cookieHeader(verifierJar) }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin/login?error=link");
    const written = setCookies(response);
    expect(sessionCookieNames(written).filter((name) => written.get(name) !== "")).toEqual([]);
  });

  it.each([
    ["no code", "/auth/callback"],
    ["Auth's expired-link redirect", "/auth/callback?error=access_denied&error_code=otp_expired"],
  ])("sends %s back to the login with ?error=link", async (_, path) => {
    const response = await callback(request(path));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin/login?error=link");
  });
});

describe("POST /auth/logout", () => {
  // Signed in once for the block: the admin on two devices, a non-admin, and a session
  // to expire.
  let phone: { jar: Map<string, string>; accessToken: string };
  let laptop: { jar: Map<string, string>; accessToken: string };
  let nonAdmin: { jar: Map<string, string> };
  let toExpire: { jar: Map<string, string>; accessToken: string };

  beforeAll(async () => {
    const admin = await sessionUser({ isAdmin: true });
    phone = admin;
    laptop = await sessionFor(admin.userId);
    nonAdmin = await sessionUser();
    toExpire = await sessionUser();
  });

  async function expectLoggedOut(jar: Map<string, string>) {
    const response = await logout(request("/auth/logout", { method: "POST", cookie: cookieHeader(jar) }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin/login");

    const written = setCookies(response);
    const sent = [...jar.keys()].filter((name) => SESSION_COOKIE.test(name));
    expect(sent.length).toBeGreaterThan(0);
    for (const name of sent) expect(written.get(name)).toBe("");
  }

  it.each([
    ["a foreign Origin", "https://evil.example"],
    ["no Origin", null],
  ])("refuses %s with 403 on an admin session, writes no cookie, and the session stays", async (_, origin) => {
    const response = await logout(request("/auth/logout", { method: "POST", cookie: cookieHeader(phone.jar), origin }));

    expect(response.status).toBe(403);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(await accepted(phone.accessToken)).toBe(true);
  });

  it("clears an admin's session cookies and ends that session only, not the admin's other device", async () => {
    await expectLoggedOut(laptop.jar);

    expect(await accepted(laptop.accessToken)).toBe(false);
    expect(await accepted(phone.accessToken)).toBe(true);
  });

  it("clears a non-admin's session cookies", async () => {
    await expectLoggedOut(nonAdmin.jar);
  });

  it("clears an expired session's cookies when its refresh fails", async () => {
    // Revoked on the server, and past its expiry in the cookie, so the client's refresh
    // fails. This passed with the route's own `sb-*` deletion removed too: the library
    // clears this case itself. The errors it doesn't clear are the unit test's stubs.
    await supabaseAdmin.auth.admin.signOut(toExpire.accessToken, "global");
    // One cookie, unchunked: the edit below decodes it whole (2,709 characters when this
    // was written; `@supabase/ssr` chunks above 3,180).
    const cookies = [...toExpire.jar].filter(([n]) => SESSION_COOKIE.test(n));
    expect(cookies.map(([n]) => n)).toHaveLength(1);
    const [name, value] = cookies[0];
    const session = JSON.parse(Buffer.from(value.replace(/^base64-/, ""), "base64url").toString("utf8"));
    session.expires_at = Math.floor(Date.now() / 1000) - 60;
    toExpire.jar.set(name, `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`);

    await expectLoggedOut(toExpire.jar);
  });
});
