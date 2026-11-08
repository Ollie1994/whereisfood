import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError, AuthUnknownError } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `requireAdmin`'s outcomes, with `getUser` and the db layer stubbed. The integration
// tests (`tests/integration/admin-auth.test.ts`) run the same checks with real sessions.
const getUserById = vi.fn();
vi.mock("@/lib/db/users", () => ({ getUserById: (id: string) => getUserById(id) }));

const { hasSessionCookie, requireAdmin } = await import("@/lib/services/admin-auth");

const ID = "00000000-0000-4000-8000-000000000001";
const SESSION = ["sb-127-auth-token"];
const signedIn = () => Promise.resolve({ data: { user: { id: ID } }, error: null });
const failed = (error: unknown) => () => Promise.resolve({ data: { user: null }, error });

// Any network call fails the test: `fetch` is what supabase-js uses.
const fetchSpy = vi.fn(() => Promise.reject(new Error("unexpected network call")));

beforeEach(() => {
  getUserById.mockReset();
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
  it("with no session cookie, refuses before any getUser, DB or network call", async () => {
    const getUser = vi.fn(signedIn);

    const check = await requireAdmin({ cookieNames: ["theme", "sb-127-auth-token-code-verifier"], getUser });

    expect(check).toEqual({ ok: false, reason: "no-session" });
    expect(getUser).not.toHaveBeenCalled();
    expect(getUserById).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("lets an admin through with the id Auth verified", async () => {
    getUserById.mockResolvedValue({ id: ID, is_admin: true, truck_id: null, created_at: "" });

    expect(await requireAdmin({ cookieNames: SESSION, getUser: signedIn })).toEqual({ ok: true, userId: ID });
    expect(getUserById).toHaveBeenCalledWith(ID);
  });

  it.each([
    ["is_admin false", { id: ID, is_admin: false, truck_id: null, created_at: "" }],
    ["no users row", null],
  ])("refuses a signed-in user with %s as not-admin", async (_, row) => {
    getUserById.mockResolvedValue(row);

    expect(await requireAdmin({ cookieNames: SESSION, getUser: signedIn })).toEqual({ ok: false, reason: "not-admin" });
  });

  it.each([
    ["a missing session", new AuthSessionMissingError()],
    ["a bad JWT (403)", new AuthApiError("invalid JWT", 403, "bad_jwt")],
    ["a used refresh token (400)", new AuthApiError("Invalid Refresh Token", 400, "refresh_token_already_used")],
    ["a deleted user (404)", new AuthApiError("User not found", 404, "user_not_found")],
  ])("reads %s as no-session, without reading users", async (_, error) => {
    expect(await requireAdmin({ cookieNames: SESSION, getUser: failed(error) })).toEqual({ ok: false, reason: "no-session" });
    expect(getUserById).not.toHaveBeenCalled();
  });

  it("reads no error and no user as no-session", async () => {
    const getUser = () => Promise.resolve({ data: { user: null }, error: null });
    expect(await requireAdmin({ cookieNames: SESSION, getUser })).toEqual({ ok: false, reason: "no-session" });
  });

  it.each([
    ["a failed fetch", new AuthRetryableFetchError("fetch failed", 0)],
    ["a 503", new AuthRetryableFetchError("Service Unavailable", 503)],
    ["a 500 Auth answered", new AuthApiError("boom", 500, "unexpected_failure")],
    ["a 429", new AuthApiError("rate limited", 429, "over_request_rate_limit")],
    ["an unknown error", new AuthUnknownError("bad json", new Error("x"))],
    ["a plain Error", new Error("something else")],
  ])("reads %s from Auth as unavailable, not logged out (plan #32)", async (_, error) => {
    expect(await requireAdmin({ cookieNames: SESSION, getUser: failed(error) })).toEqual({ ok: false, reason: "unavailable" });
    expect(getUserById).not.toHaveBeenCalled();
  });

  it("reads a throw from getUser as unavailable", async () => {
    const getUser = () => Promise.reject(new Error("network down"));
    expect(await requireAdmin({ cookieNames: SESSION, getUser })).toEqual({ ok: false, reason: "unavailable" });
  });

  it("reads a throw from getUserById as unavailable", async () => {
    getUserById.mockRejectedValue(new Error("connection refused"));
    expect(await requireAdmin({ cookieNames: SESSION, getUser: signedIn })).toEqual({ ok: false, reason: "unavailable" });
  });
});
