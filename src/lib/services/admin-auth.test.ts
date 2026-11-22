import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError, AuthUnknownError } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LINK as link, SIGNED_IN, TOTP as totp, unsignedJwt as token } from "../../../tests/jwt";

// `requireAdmin`'s and `mfaStepAllowed`'s outcomes, with the session client's `auth` and the
// db layer stubbed. The integration tests (`tests/integration/admin-auth.test.ts`) run the
// same checks with real sessions.
const getUserById = vi.fn();
vi.mock("@/lib/db/users", () => ({ getUserById: (id: string) => getUserById(id) }));

const { SESSION_MAX_AGE_MS, hasSessionCookie, mfaStepAllowed, requireAdmin } = await import("@/lib/services/admin-auth");
type SessionAuth = import("@/lib/services/admin-auth").SessionAuth;

const ID = "00000000-0000-4000-8000-000000000001";
const SESSION = ["sb-127-auth-token"];
const ADMIN = { id: ID, is_admin: true, truck_id: null, created_at: "" };

// The caller's clock: by default the moment `link`'s session signed in.
const SIGNED_IN_MS = SIGNED_IN * 1000;
const NOW = new Date(SIGNED_IN_MS);
const HOUR = 60 * 60 * 1000;

const AAL1 = token({ aal: "aal1", amr: [link] });
const AAL2 = token({ aal: "aal2", amr: [link, totp] });

const FACTOR = "00000000-0000-4000-8000-0000000000f1";
const verified = [{ id: FACTOR, status: "verified" }];

// The stubbed `auth`: `getSession` hands out `access`, `getUser` answers `user` (or `error`).
function auth({
  access = AAL2,
  user = { id: ID, factors: verified } as { id: string; factors?: { id: string; status: string }[] } | null,
  sessionError = null as unknown,
  userError = null as unknown,
} = {}) {
  return {
    getSession: vi.fn(() =>
      Promise.resolve({ data: { session: sessionError ? null : { access_token: access } }, error: sessionError }),
    ),
    getUser: vi.fn<SessionAuth["getUser"]>(() => Promise.resolve({ data: { user: userError ? null : user }, error: userError })),
    signOut: vi.fn<SessionAuth["signOut"]>(() => Promise.resolve({ error: null })),
  };
}

// Any network call fails the test: `fetch` is what supabase-js uses.
const fetchSpy = vi.fn(() => Promise.reject(new Error("unexpected network call")));

beforeEach(() => {
  getUserById.mockReset();
  getUserById.mockResolvedValue(ADMIN);
  fetchSpy.mockClear();
  vi.stubGlobal("fetch", fetchSpy);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());

describe("hasSessionCookie", () => {
  it.each([
    [["sb-127-auth-token"], true],
    [["theme", "sb-abcdef-auth-token.0", "sb-abcdef-auth-token.1"], true],
    [["sb-127-auth-token-code-verifier"], false],
    [["sb-127-auth-token.x"], false],
    [["auth-token"], false],
    [[], false],
  ])("%j → %s", (names, expected) => {
    expect(hasSessionCookie(names)).toBe(expected);
  });
});

describe("requireAdmin", () => {
  it("with no session cookie, refuses before any Auth, DB or network call", async () => {
    const stub = auth();

    const check = await requireAdmin({ now: NOW, cookieNames: ["theme", "sb-127-auth-token-code-verifier"], auth: stub });

    expect(check).toEqual({ ok: false, reason: "no-session" });
    expect(stub.getSession).not.toHaveBeenCalled();
    expect(stub.getUser).not.toHaveBeenCalled();
    expect(getUserById).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("lets an aal2 admin through with the id Auth verified, asking Auth about the session's own token", async () => {
    const stub = auth();

    expect(await requireAdmin({ now: NOW, cookieNames: SESSION, auth: stub })).toEqual({ ok: true, userId: ID });
    expect(stub.getUser).toHaveBeenCalledWith(AAL2);
    expect(getUserById).toHaveBeenCalledWith(ID);
    expect(stub.signOut).not.toHaveBeenCalled();
  });

  // The order varies between logins (IS #381), so the first factor is found by its method.
  it("lets an aal2 admin through with amr in either order", async () => {
    const stub = auth({ access: token({ aal: "aal2", amr: [totp, link] }) });
    expect(await requireAdmin({ now: NOW, cookieNames: SESSION, auth: stub })).toEqual({ ok: true, userId: ID });
  });

  it("refuses an aal1 admin as needs-mfa, told apart from no-session, and keeps the session", async () => {
    const stub = auth({ access: AAL1 });

    expect(await requireAdmin({ now: NOW, cookieNames: SESSION, auth: stub })).toEqual({ ok: false, reason: "needs-mfa" });
    expect(stub.signOut).not.toHaveBeenCalled();
  });

  it.each([
    ["no aal claim", token({ amr: [link, totp] })],
    ["an aal claim of aal3", token({ aal: "aal3", amr: [link, totp] })],
  ])("refuses %s as needs-mfa", async (_, access) => {
    expect(await requireAdmin({ now: NOW, cookieNames: SESSION, auth: auth({ access }) })).toEqual({ ok: false, reason: "needs-mfa" });
  });

  it.each([
    ["is_admin false", { ...ADMIN, is_admin: false }],
    ["no users row", null],
  ])("refuses a signed-in user with %s as not-admin", async (_, row) => {
    getUserById.mockResolvedValue(row);

    expect(await requireAdmin({ now: NOW, cookieNames: SESSION, auth: auth() })).toEqual({ ok: false, reason: "not-admin" });
  });

  // Plan #14: the magic link only. A refused session is signed out at Auth, before the DB.
  it.each([
    ["a directly verified code (otp)", token({ aal: "aal2", amr: [{ ...link, method: "otp" }, totp] })],
    ["a password login", token({ aal: "aal2", amr: [{ ...link, method: "password" }, totp] })],
    ["two first factors", token({ aal: "aal2", amr: [link, { ...link, method: "otp" }, totp] })],
    ["only totp", token({ aal: "aal2", amr: [totp] })],
    ["RFC 8176's plain strings", token({ aal: "aal2", amr: ["magiclink", "totp"] })],
    ["no amr claim", token({ aal: "aal2" })],
    ["an unreadable payload", "e30.not-json.sig"],
  ])("refuses %s as no-session and signs it out locally", async (_, access) => {
    const stub = auth({ access });

    expect(await requireAdmin({ now: NOW, cookieNames: SESSION, auth: stub })).toEqual({ ok: false, reason: "no-session" });
    expect(stub.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
    expect(getUserById).not.toHaveBeenCalled();
  });

  it.each([
    ["answers an error", () => Promise.resolve({ error: new AuthRetryableFetchError("fetch failed", 0) })],
    ["throws", () => Promise.reject(new Error("network down"))],
  ])("answers a first factor outside the allowlist unavailable, not no-session, when the signOut %s", async (_, signOut) => {
    const stub = { ...auth({ access: token({ aal: "aal1", amr: [{ ...link, method: "otp" }] }) }), signOut: vi.fn(signOut) };

    expect(await requireAdmin({ now: NOW, cookieNames: SESSION, auth: stub })).toEqual({ ok: false, reason: "unavailable" });
    expect(getUserById).not.toHaveBeenCalled();
  });

  const invalid: [string, unknown][] = [
    ["a missing session", new AuthSessionMissingError()],
    ["a bad JWT", new AuthApiError("invalid JWT", 403, "bad_jwt")],
    ["a deleted user", new AuthApiError("User from sub claim in JWT does not exist", 403, "user_not_found")],
    ["an unknown refresh token", new AuthApiError("Invalid Refresh Token: Refresh Token Not Found", 400, "refresh_token_not_found")],
    ["a used refresh token", new AuthApiError("Invalid Refresh Token: Already Used", 400, "refresh_token_already_used")],
    ["an expired session", new AuthApiError("Session Expired", 403, "session_expired")],
    ["a banned user", new AuthApiError("User is banned", 403, "user_banned")],
  ];

  const temporary: [string, unknown][] = [
    ["a failed fetch", new AuthRetryableFetchError("fetch failed", 0)],
    ["a 503", new AuthRetryableFetchError("Service Unavailable", 503)],
    ["a 500 Auth answered", new AuthApiError("boom", 500, "unexpected_failure")],
    ["a 429", new AuthApiError("rate limited", 429, "over_request_rate_limit")],
    // What a gateway refusing the anon key might send. Not reproduced: the local stack
    // answered a wrong anon key with no error.
    ["a 401 with no code", new AuthApiError("Invalid API key", 401, undefined)],
    ["a 400 validation_failed", new AuthApiError("Refresh token is not valid", 400, "validation_failed")],
    ["an unknown error", new AuthUnknownError("bad json", new Error("x"))],
    ["a plain Error", new Error("something else")],
  ];

  it.each(invalid)("reads %s from the session read as no-session, without asking Auth or reading users", async (_, error) => {
    const stub = auth({ sessionError: error });

    expect(await requireAdmin({ now: NOW, cookieNames: SESSION, auth: stub })).toEqual({ ok: false, reason: "no-session" });
    expect(stub.getUser).not.toHaveBeenCalled();
    expect(getUserById).not.toHaveBeenCalled();
  });

  // No signOut of its own: `getUser(token)` clears a missing session from storage itself
  // (auth-js 2.106.2, `_getUser`'s `catch`; the integration test's logged-out case).
  it.each(invalid)("reads %s from getUser as no-session, without reading users or signing out", async (_, error) => {
    const stub = auth({ userError: error });
    expect(await requireAdmin({ now: NOW, cookieNames: SESSION, auth: stub })).toEqual({ ok: false, reason: "no-session" });
    expect(getUserById).not.toHaveBeenCalled();
    expect(stub.signOut).not.toHaveBeenCalled();
  });

  it("reads no session and no error as no-session, without asking Auth", async () => {
    const stub = { ...auth(), getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })) };

    expect(await requireAdmin({ now: NOW, cookieNames: SESSION, auth: stub })).toEqual({ ok: false, reason: "no-session" });
    expect(stub.getUser).not.toHaveBeenCalled();
  });

  it("reads no error and no user as no-session", async () => {
    expect(await requireAdmin({ now: NOW, cookieNames: SESSION, auth: auth({ user: null }) })).toEqual({ ok: false, reason: "no-session" });
  });

  it.each(temporary)("reads %s from the session read as unavailable, not logged out (plan #32)", async (_, error) => {
    expect(await requireAdmin({ now: NOW, cookieNames: SESSION, auth: auth({ sessionError: error }) })).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it.each(temporary)("reads %s from getUser as unavailable, not logged out (plan #32)", async (_, error) => {
    const stub = auth({ userError: error });

    expect(await requireAdmin({ now: NOW, cookieNames: SESSION, auth: stub })).toEqual({ ok: false, reason: "unavailable" });
    expect(stub.signOut).not.toHaveBeenCalled();
    expect(getUserById).not.toHaveBeenCalled();
  });

  it.each(["getSession", "getUser"] as const)("reads a throw from %s as unavailable", async (method) => {
    const stub = { ...auth(), [method]: vi.fn(() => Promise.reject(new Error("network down"))) };
    expect(await requireAdmin({ now: NOW, cookieNames: SESSION, auth: stub })).toEqual({ ok: false, reason: "unavailable" });
  });

  // The time-box (Phase 9 plan step 6, #4), 12 hours from the first factor's sign-in.
  describe("the time-box", () => {
    it("is 12 hours", () => {
      expect(SESSION_MAX_AGE_MS).toBe(12 * HOUR);
    });

    it("lets a session through just under 12 hours from its sign-in", async () => {
      const stub = auth();
      const now = new Date(SIGNED_IN_MS + SESSION_MAX_AGE_MS - 1);

      expect(await requireAdmin({ now, cookieNames: SESSION, auth: stub })).toEqual({ ok: true, userId: ID });
      expect(stub.signOut).not.toHaveBeenCalled();
    });

    it("lets a fresh session through while Auth's clock is ahead (its iat at the sign-in, now an hour behind)", async () => {
      const stub = auth({ access: token({ aal: "aal2", amr: [link, totp], iat: SIGNED_IN }) });
      const now = new Date(SIGNED_IN_MS - HOUR);
      expect(await requireAdmin({ now, cookieNames: SESSION, auth: stub })).toEqual({ ok: true, userId: ID });
    });

    // Auth's clock ahead of this server's doesn't lengthen the box: the token's `iat` is Auth's
    // clock (the plan's open decision 2).
    it("reads the age on iat when it is ahead of now: a second under 12 hours on iat passes, now a day behind", async () => {
      const stub = auth({ access: token({ aal: "aal2", amr: [link, totp], iat: SIGNED_IN + SESSION_MAX_AGE_MS / 1000 - 1 }) });
      const now = new Date(SIGNED_IN_MS - 24 * HOUR);

      expect(await requireAdmin({ now, cookieNames: SESSION, auth: stub })).toEqual({ ok: true, userId: ID });
      expect(stub.signOut).not.toHaveBeenCalled();
    });

    it("reads the age on iat when it is ahead of now: 12 hours on iat is refused and signed out before the DB, now a day behind", async () => {
      const stub = auth({ access: token({ aal: "aal2", amr: [link, totp], iat: SIGNED_IN + SESSION_MAX_AGE_MS / 1000 }) });
      const now = new Date(SIGNED_IN_MS - 24 * HOUR);

      expect(await requireAdmin({ now, cookieNames: SESSION, auth: stub })).toEqual({ ok: false, reason: "no-session" });
      expect(stub.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
      expect(getUserById).not.toHaveBeenCalled();
    });

    it("reads the age on now when iat is behind it", async () => {
      const stub = auth({ access: token({ aal: "aal2", amr: [link, totp], iat: SIGNED_IN }) });
      const now = new Date(SIGNED_IN_MS + SESSION_MAX_AGE_MS);
      expect(await requireAdmin({ now, cookieNames: SESSION, auth: stub })).toEqual({ ok: false, reason: "no-session" });
    });

    // Auth's clock behind this server's: `now` is held at the token's `exp`.
    it("lets a fresh login through while Auth's clock is 13 hours behind (iat at the sign-in, exp an hour on)", async () => {
      const stub = auth({ access: token({ aal: "aal2", amr: [link, totp], iat: SIGNED_IN, exp: SIGNED_IN + 3600 }) });
      const now = new Date(SIGNED_IN_MS + 13 * HOUR);

      expect(await requireAdmin({ now, cookieNames: SESSION, auth: stub })).toEqual({ ok: true, userId: ID });
      expect(stub.signOut).not.toHaveBeenCalled();
    });

    it.each([
      ["a second under 12 hours", SESSION_MAX_AGE_MS / 1000 - 1, { ok: true, userId: ID }],
      ["12 hours", SESSION_MAX_AGE_MS / 1000, { ok: false, reason: "no-session" }],
    ])("reads the age on exp when it is behind now: exp %s on, now a day on", async (_, expAge, expected) => {
      const stub = auth({ access: token({ aal: "aal2", amr: [link, totp], iat: SIGNED_IN + expAge - 3600, exp: SIGNED_IN + expAge }) });
      const now = new Date(SIGNED_IN_MS + 24 * HOUR);

      expect(await requireAdmin({ now, cookieNames: SESSION, auth: stub })).toEqual(expected);
      expect(stub.signOut).toHaveBeenCalledTimes(expected.ok ? 0 : 1);
    });

    it("leaves out a string exp", async () => {
      const stub = auth({ access: token({ aal: "aal2", amr: [link, totp], iat: SIGNED_IN, exp: String(SIGNED_IN + 3600) }) });
      const now = new Date(SIGNED_IN_MS + SESSION_MAX_AGE_MS);
      expect(await requireAdmin({ now, cookieNames: SESSION, auth: stub })).toEqual({ ok: false, reason: "no-session" });
    });

    // On `now` alone: admitted just under 12 hours on `now`, refused at 12. The string `iat`,
    // 13 hours on, would refuse the first if it were read as a number.
    it.each([
      ["no iat", {}],
      ["a string iat", { iat: String(SIGNED_IN + 13 * 3600) }],
    ])("reads a token with %s on now alone", async (_, iat) => {
      const access = token({ aal: "aal2", amr: [link, totp], ...iat });
      const at = (ms: number) => ({ now: new Date(SIGNED_IN_MS + ms), cookieNames: SESSION, auth: auth({ access }) });

      expect(await requireAdmin(at(SESSION_MAX_AGE_MS - 1))).toEqual({ ok: true, userId: ID });
      expect(await requireAdmin(at(SESSION_MAX_AGE_MS))).toEqual({ ok: false, reason: "no-session" });
    });

    it.each([
      ["at 12 hours", SESSION_MAX_AGE_MS],
      ["a day past them", SESSION_MAX_AGE_MS + 24 * HOUR],
    ])("refuses an aal2 session %s as no-session, signed out locally before the DB", async (_, age) => {
      const stub = auth();

      expect(await requireAdmin({ now: new Date(SIGNED_IN_MS + age), cookieNames: SESSION, auth: stub })).toEqual({
        ok: false,
        reason: "no-session",
      });
      expect(stub.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
      expect(getUserById).not.toHaveBeenCalled();
    });

    // A later TOTP verify adds a fresh `amr` entry; the box counts from the first factor's,
    // with `amr` in either order (#4).
    const reverified = { method: "totp", timestamp: SIGNED_IN + 11 * 3600 };
    it.each([
      ["link, then totp", [link, reverified]],
      ["totp, then link", [reverified, link]],
    ])("measures from the first factor, not a later verify (%s)", async (_, amr) => {
      const stub = auth({ access: token({ aal: "aal2", amr }) });
      const now = new Date(SIGNED_IN_MS + 13 * HOUR);

      expect(await requireAdmin({ now, cookieNames: SESSION, auth: stub })).toEqual({ ok: false, reason: "no-session" });
      expect(stub.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
    });

    it.each([
      ["no timestamp", { method: "magiclink" }],
      ["a string timestamp", { method: "magiclink", timestamp: String(SIGNED_IN) }],
    ])("refuses a first factor with %s as no-session, and signs it out", async (_, entry) => {
      const stub = auth({ access: token({ aal: "aal2", amr: [entry, totp] }) });

      expect(await requireAdmin({ now: NOW, cookieNames: SESSION, auth: stub })).toEqual({ ok: false, reason: "no-session" });
      expect(stub.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
    });

    it.each([
      ["answers an error", () => Promise.resolve({ error: new AuthRetryableFetchError("fetch failed", 0) })],
      ["throws", () => Promise.reject(new Error("network down"))],
    ])("still refuses a session past the box, as unavailable, when the signOut %s", async (_, signOut) => {
      const stub = { ...auth(), signOut: vi.fn(signOut) };
      const now = new Date(SIGNED_IN_MS + 13 * HOUR);

      expect(await requireAdmin({ now, cookieNames: SESSION, auth: stub })).toEqual({ ok: false, reason: "unavailable" });
      expect(getUserById).not.toHaveBeenCalled();
    });
  });

  it("reads a throw from getUserById as unavailable", async () => {
    getUserById.mockRejectedValue(new Error("connection refused"));
    expect(await requireAdmin({ now: NOW, cookieNames: SESSION, auth: auth() })).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("mfaStepAllowed", () => {
  it.each([
    ["no factor", [], { step: "enroll" }],
    ["only an unverified one (an abandoned enroll)", [{ id: "x", status: "unverified" }], { step: "enroll" }],
    ["a verified factor", verified, { step: "code", factorId: FACTOR }],
    ["an unverified and a verified one", [{ id: "x", status: "unverified" }, ...verified], { step: "code", factorId: FACTOR }],
  ])("gives an aal1 admin with %s the step %j", async (_, factors, step) => {
    const stub = auth({ access: AAL1, user: { id: ID, factors } });
    expect(await mfaStepAllowed({ now: NOW, cookieNames: SESSION, auth: stub })).toEqual({ ok: true, ...step });
  });

  it("reads a user with no factors list as enroll", async () => {
    const stub = auth({ access: AAL1, user: { id: ID } });
    expect(await mfaStepAllowed({ now: NOW, cookieNames: SESSION, auth: stub })).toEqual({ ok: true, step: "enroll" });
  });

  it("answers an aal2 admin done", async () => {
    expect(await mfaStepAllowed({ now: NOW, cookieNames: SESSION, auth: auth() })).toEqual({ ok: false, reason: "done" });
  });

  // The allowlist applies here too (plan #14): a guessed code's session could otherwise
  // enroll through the app's page while the one slot is free.
  it("refuses an otp session as no-session and signs it out locally", async () => {
    const stub = auth({ access: token({ aal: "aal1", amr: [{ ...link, method: "otp" }] }), user: { id: ID, factors: [] } });

    expect(await mfaStepAllowed({ now: NOW, cookieNames: SESSION, auth: stub })).toEqual({ ok: false, reason: "no-session" });
    expect(stub.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
  });

  it.each([
    ["no session cookie", { now: NOW, cookieNames: [], auth: auth({ access: AAL1 }) }, "no-session"],
    ["Auth failing", { now: NOW, cookieNames: SESSION, auth: auth({ userError: new AuthRetryableFetchError("fetch failed", 0) }) }, "unavailable"],
  ])("refuses %s as %s", async (_, input, reason) => {
    expect(await mfaStepAllowed(input)).toEqual({ ok: false, reason });
  });

  // The time-box is in `verify`, so it holds here too (plan step 6).
  it("refuses an aal1 session past the time-box, and signs it out", async () => {
    const stub = auth({ access: AAL1, user: { id: ID, factors: [] } });
    const now = new Date(SIGNED_IN_MS + 13 * HOUR);

    expect(await mfaStepAllowed({ now, cookieNames: SESSION, auth: stub })).toEqual({ ok: false, reason: "no-session" });
    expect(stub.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
  });

  it("refuses a non-admin's aal1 session as not-admin", async () => {
    getUserById.mockResolvedValue({ ...ADMIN, is_admin: false });
    expect(await mfaStepAllowed({ now: NOW, cookieNames: SESSION, auth: auth({ access: AAL1 }) })).toEqual({ ok: false, reason: "not-admin" });
  });
});
