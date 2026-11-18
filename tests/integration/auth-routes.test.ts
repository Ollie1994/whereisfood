import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as callback } from "@/app/auth/callback/route";
import { GET as trucks } from "@/app/api/admin/trucks/route";
import { POST as logout } from "@/app/auth/logout/route";
import { supabaseAdmin } from "@/lib/supabase";
import {
  FIXTURE_PREFIX,
  SIGN_IN_TIMEOUT,
  accepted,
  anonClient,
  authUserIdsWhere,
  cookieHeader,
  editSessionCookie,
  SESSION_COOKIE,
  createFixtureAuthUser,
  fixtureEmail,
  jarClient,
  requestLink,
  resetTables,
  sessionFor,
  sessionUser,
} from "./helpers";

// `/auth/callback` and `/auth/logout` against the local stack (Phase 7 plan, step 2).
// Each `sessionUser`/`sessionFor` is a magic-link sign-in, and the file also asks Auth
// itself: a link once through `requestLink`, a link twice for an address with no account,
// a password sign-up once, and one admin `generateLink`, which sends no email; why no Auth
// limit binds them is `helpers.ts`'s `signInByLink`.

const ORIGIN = "http://127.0.0.1:3000";

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

// The code Auth issues with every link, which no email shows but Auth accepts (Phase 9 plan
// #14): 10 digits on the running stack, as `config.toml` sets (plan step 8, IS #386).
// `config.test.ts` pins the file; this shows the stack read it.
describe("the email code", () => {
  it("is 10 digits", async () => {
    const userId = await createFixtureAuthUser();
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email: fixtureEmail(userId) });

    expect(error).toBeNull();
    expect(data.properties?.email_otp).toMatch(/^\d{10}$/);
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
    const link = await requestLink(jarClient(verifierJar), fixtureEmail(userId));
    const verify = await fetch(link, { redirect: "manual" });
    const location = new URL(verify.headers.get("location") ?? "");
    expect(`${location.origin}${location.pathname}`).toBe(`${ORIGIN}/auth/callback`);
    code = location.searchParams.get("code") ?? "";
    expect(code).not.toBe("");
  }, SIGN_IN_TIMEOUT);

  // The next two run before the exchange test, which then shows the code wasn't spent: if
  // either ever spends it, the failure shows there, not here.

  // #224's phone failure: the link opened in a browser without the verifier cookie.
  it("sends a code with no verifier cookie back with ?error=browser and no session", async () => {
    const response = await callback(request(`/auth/callback?code=${code}`));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin/login?error=browser");
    const written = setCookies(response);
    expect(sessionCookieNames(written).filter((name) => written.get(name) !== "")).toEqual([]);
  });

  // A browser holding another login's verifier: a send Auth refuses still stores one before
  // the request (`loginMessage`'s comment), so an address with no account gives a jar with
  // a verifier and sends no mail. Auth's own answer is asserted first: a missing verifier
  // also gives `browser`, so only that assertion tells the two apart.
  it("sends a code with another login's verifier back with ?error=browser and no session", async () => {
    const wrongJar = new Map<string, string>();
    const { error: sendError } = await jarClient(wrongJar).auth.signInWithOtp({
      email: fixtureEmail(randomUUID()),
      options: { shouldCreateUser: false, emailRedirectTo: `${ORIGIN}/auth/callback` },
    });
    expect(sendError?.code).toBe("otp_disabled");

    const { error } = await jarClient(new Map(wrongJar)).auth.exchangeCodeForSession(code);
    expect([error?.status, error?.code]).toEqual([400, "bad_code_verifier"]);

    const response = await callback(request(`/auth/callback?code=${code}`, { cookie: cookieHeader(wrongJar) }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin/login?error=browser");
    const written = setCookies(response);
    expect(sessionCookieNames(written).filter((name) => written.get(name) !== "")).toEqual([]);
  });

  it("exchanges the code, writes a session cookie Auth accepts, and lands on the MFA step", async () => {
    const response = await callback(request(`/auth/callback?code=${code}`, { cookie: cookieHeader(verifierJar) }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin/mfa");

    const written = setCookies(response);
    const names = sessionCookieNames(written).filter((name) => written.get(name) !== "");
    expect(names.length).toBeGreaterThan(0);

    const jar = new Map(names.map((name) => [name, written.get(name) as string]));
    const { data } = await jarClient(jar).auth.getUser();
    expect(data.user?.id).toBe(userId);
  });

  // With its verifier still sent, which a browser no longer holds after its own exchange
  // (`_exchangeCodeForSession` removes it); without one, a used code gets `browser`.
  it("sends a used code, sent with its verifier, back to the login with ?error=link and no session", async () => {
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
  // Signed in once for the block: an admin at `aal2`, a session that works in the app, which
  // a forged logout would target; a non-admin; and a session to expire. The global logout's
  // describe signs in its own, since it ends every session of its user.
  let admin: { jar: Map<string, string>; accessToken: string };
  let nonAdmin: { jar: Map<string, string> };
  let toExpire: { jar: Map<string, string>; accessToken: string };

  beforeAll(async () => {
    admin = await sessionUser({ isAdmin: true, aal2: true });
    nonAdmin = await sessionUser();
    toExpire = await sessionUser();
  }, SIGN_IN_TIMEOUT);

  // An admin request on the jar's session, as the browser's next one would be.
  const adminRequest = (jar: Map<string, string>) => trucks(request("/api/admin/trucks", { cookie: cookieHeader(jar) }));

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
    const response = await logout(request("/auth/logout", { method: "POST", cookie: cookieHeader(admin.jar), origin }));

    expect(response.status).toBe(403);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(await accepted(admin.accessToken)).toBe(true);
  });

  // `scope: "global"` (Phase 9 plan, #5): every session of the user ends, and no other
  // user's (the block's `admin`, whom no test here logs out).
  describe("a global logout", () => {
    let phone: { userId: string; jar: Map<string, string>; accessToken: string };
    let laptop: { jar: Map<string, string>; accessToken: string };

    beforeAll(async () => {
      phone = await sessionUser({ isAdmin: true, aal2: true });
      laptop = await sessionFor(phone.userId, { aal2: true });
    }, SIGN_IN_TIMEOUT);

    it("clears an admin's session cookies and ends every session of the admin, the other device's next request refused", async () => {
      expect((await adminRequest(phone.jar)).status).toBe(200);
      expect((await adminRequest(laptop.jar)).status).toBe(200);

      await expectLoggedOut(laptop.jar);

      expect(await accepted(laptop.accessToken)).toBe(false);
      expect(await accepted(phone.accessToken)).toBe(false);
      const next = await adminRequest(phone.jar);
      expect(next.status).toBe(401);
      expect(await next.json()).toEqual({ error: "Du är inte inloggad" });
      expect(await accepted(admin.accessToken)).toBe(true);
    });
  });

  it("clears a non-admin's session cookies", async () => {
    await expectLoggedOut(nonAdmin.jar);
  });

  it("clears an expired session's cookies when its refresh fails, as a plain logout", async () => {
    // Revoked on the server, and past its expiry in the cookie, so the client's refresh
    // fails. This passed with the route's own `sb-*` deletion removed too: the library
    // clears this case itself. The errors it doesn't clear are the unit test's stubs. The
    // refused refresh says the session is already gone (`isInvalidSession`), so no warning.
    await supabaseAdmin.auth.admin.signOut(toExpire.accessToken, "global");
    const expired = editSessionCookie(toExpire.jar, (session) => {
      session.expires_at = Math.floor(Date.now() / 1000) - 60;
    });

    await expectLoggedOut(expired);
  });
});
