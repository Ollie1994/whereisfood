import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { isInvalidSession } from "@/lib/auth-errors";

describe("isInvalidSession", () => {
  it.each([
    ["AuthSessionMissingError", new AuthSessionMissingError()],
    ["bad_jwt", new AuthApiError("invalid JWT", 403, "bad_jwt")],
    ["no_authorization", new AuthApiError("This endpoint requires a valid Bearer token", 401, "no_authorization")],
    ["refresh_token_not_found", new AuthApiError("x", 400, "refresh_token_not_found")],
  ])("is true for %s", (_, error) => {
    expect(isInvalidSession(error)).toBe(true);
  });

  it.each([
    ["a failed fetch", new AuthRetryableFetchError("fetch failed", 0)],
    ["a wrong code", new AuthApiError("Invalid TOTP code entered", 422, "mfa_verification_failed")],
    ["validation_failed", new AuthApiError("x", 400, "validation_failed")],
    ["a 401 with no code", new AuthApiError("Invalid API key", 401, undefined)],
    ["a plain object with the code", { code: "bad_jwt" }],
  ])("is false for %s", (_, error) => {
    expect(isInvalidSession(error)).toBe(false);
  });
});
