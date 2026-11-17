import { describe, expect, it } from "vitest";
import {
  AuthApiError,
  AuthPKCECodeVerifierMissingError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
} from "@supabase/supabase-js";
import {
  callbackErrorFor,
  callbackErrorMessage,
  isInvalidSession,
  isTemporaryAuthError,
  loginMessage,
  loginStatusFor,
  mfaAlert,
  mfaCode,
  mfaFormOff,
  mfaMessage,
  mfaStatusFor,
  type LoginStatus,
  type MfaStatus,
} from "@/lib/login";

describe("loginStatusFor", () => {
  it("is sent when Auth answers with no error", () => {
    expect(loginStatusFor(null)).toBe("sent");
  });

  it("gives an unknown email the same LoginStatus as a real send", () => {
    expect(loginStatusFor({ status: 422, code: "otp_disabled" })).toBe("sent");
  });

  it("is rate-limited on 429, by status or by code", () => {
    expect(loginStatusFor({ status: 429, code: "over_email_send_rate_limit" })).toBe("rate-limited");
    expect(loginStatusFor({ status: 429 })).toBe("rate-limited");
    expect(loginStatusFor({ code: "over_email_send_rate_limit" })).toBe("rate-limited");
  });

  it("is failed on any other error", () => {
    expect(loginStatusFor({ status: 500, code: "unexpected_failure" })).toBe("failed");
    expect(loginStatusFor({})).toBe("failed");
  });
});

describe("loginMessage", () => {
  it("has no text before a send or while sending", () => {
    expect(loginMessage("idle")).toBeNull();
    expect(loginMessage("sending")).toBeNull();
  });

  it("has Swedish text for every outcome", () => {
    const outcomes: LoginStatus[] = ["sent", "rate-limited", "failed"];
    for (const status of outcomes) expect(loginMessage(status)).toMatch(/[a-zåäö]/i);
    expect(loginMessage("sent")).toMatch(/inloggningslänk/);
  });

  it("warns on a refused or failed send that earlier links stop working", () => {
    expect(loginMessage("rate-limited")).toMatch(/fungerar inte längre/);
    expect(loginMessage("failed")).toMatch(/fungerar inte längre/);
  });

  // The owner's approved wording, whole (IS #240): a change to it is a change to this test.
  it("says to open the link in this browser, copying it on a phone (IS #240)", () => {
    expect(loginMessage("sent")).toBe(
      "Om adressen har ett konto har vi skickat en inloggningslänk. Öppna den i den här webbläsaren. På mobilen: kopiera länken och klistra in den i adressfältet här, i stället för att trycka på den i mejlappen.",
    );
  });
});

describe("callbackErrorMessage", () => {
  // The owner's approved wording, whole (IS #240): a change to it is a change to this test.
  it("explains an expired or used link", () => {
    expect(callbackErrorMessage("link")).toBe(
      "Inloggningslänken fungerade inte. Den kan ha gått ut eller redan använts. Be om en ny.",
    );
  });

  it("names both causes of a verifier that doesn't match, and sends the admin back to the usual browser (IS #240)", () => {
    expect(callbackErrorMessage("browser")).toBe(
      "Inloggningslänken fungerade inte i den här webbläsaren. Den kan ha öppnats i en annan webbläsare än den som bad om den, eller slutat gälla när en ny länk begärdes. Be om en ny i din vanliga webbläsare och öppna den där. På mobilen: kopiera den dit i stället för att trycka på den i mejlappen.",
    );
  });

  it("tells an Auth failure apart from a bad link", () => {
    expect(callbackErrorMessage("unavailable")).toMatch(/Vänta en stund och be sedan om en ny länk/);
  });

  it("is null for no error and for anything else", () => {
    expect(callbackErrorMessage(undefined)).toBeNull();
    expect(callbackErrorMessage("other")).toBeNull();
    expect(callbackErrorMessage(["link", "link"])).toBeNull();
  });
});

describe("callbackErrorFor", () => {
  it("is browser when this browser holds no PKCE verifier, or one that doesn't match", () => {
    expect(callbackErrorFor(new AuthPKCECodeVerifierMissingError())).toBe("browser");
    expect(callbackErrorFor(new AuthApiError("mismatch", 400, "bad_code_verifier"))).toBe("browser");
  });

  it("is unavailable for a temporary Auth failure", () => {
    expect(callbackErrorFor(new AuthRetryableFetchError("network down", 0))).toBe("unavailable");
    expect(callbackErrorFor(new AuthApiError("boom", 500, "unexpected_failure"))).toBe("unavailable");
  });

  it("is link for any other answer about the code", () => {
    expect(callbackErrorFor(new AuthApiError("used", 400, "validation_failed"))).toBe("link");
    expect(callbackErrorFor({})).toBe("link");
  });
});

describe("isTemporaryAuthError", () => {
  it("is true for a failed fetch, a 429 and a 5xx", () => {
    expect(isTemporaryAuthError(new AuthRetryableFetchError("network down", 0))).toBe(true);
    expect(isTemporaryAuthError(new AuthRetryableFetchError("bad gateway", 502))).toBe(true);
    expect(isTemporaryAuthError(new AuthApiError("boom", 500, "unexpected_failure"))).toBe(true);
    expect(isTemporaryAuthError(new AuthApiError("slow down", 429, "over_request_rate_limit"))).toBe(true);
  });

  it("is false for no error and for an answer about the link or session", () => {
    expect(isTemporaryAuthError(null)).toBe(false);
    expect(isTemporaryAuthError(new AuthApiError("used", 400, "validation_failed"))).toBe(false);
    expect(isTemporaryAuthError(new AuthApiError("gone", 403, "session_not_found"))).toBe(false);
  });
});

describe("mfaStatusFor", () => {
  it("is verified when Auth answers with no error", () => {
    expect(mfaStatusFor(null)).toBe("verified");
  });

  // Local Auth's answer to a wrong code (the PR for IS #382).
  it("is wrong-code on mfa_verification_failed", () => {
    expect(mfaStatusFor({ status: 422, code: "mfa_verification_failed" })).toBe("wrong-code");
  });

  it("is rate-limited on 429", () => {
    expect(mfaStatusFor({ status: 429, code: "over_request_rate_limit" })).toBe("rate-limited");
  });

  // With no stored session auth-js sends only the anon key, and Auth answers 403 `bad_jwt`
  // (`curl` of a factor's `/challenge`, the PR for IS #382).
  it.each([
    ["a missing session", new AuthSessionMissingError()],
    ["the anon key alone", new AuthApiError("invalid claim: missing sub claim", 403, "bad_jwt")],
    ["a failed refresh", new AuthApiError("Invalid Refresh Token: Refresh Token Not Found", 400, "refresh_token_not_found")],
  ])("is expired on %s", (_, error) => {
    expect(mfaStatusFor(error)).toBe("expired");
  });

  it("is failed on any other error", () => {
    expect(mfaStatusFor({ status: 500, code: "unexpected_failure" })).toBe("failed");
    expect(mfaStatusFor({ status: 422, code: "mfa_challenge_expired" })).toBe("failed");
    expect(mfaStatusFor({})).toBe("failed");
  });
});

describe("mfaMessage", () => {
  it.each<MfaStatus>(["preparing", "unprepared", "wrong-code", "rate-limited", "failed", "expired", "verified"])(
    "has Swedish text for %s",
    (status) => {
      expect(mfaMessage(status)).toEqual(expect.any(String));
    },
  );

  it.each<MfaStatus>(["ready", "verifying"])("has none for %s", (status) => {
    expect(mfaMessage(status)).toBeNull();
  });

  it("gives every refusal its own text", () => {
    const texts = (["unprepared", "wrong-code", "rate-limited", "failed", "expired"] as const).map(mfaMessage);
    expect(new Set(texts).size).toBe(texts.length);
  });
});

describe("mfaCode", () => {
  it.each([
    ["123456", "123456"],
    ["123 456", "123456"],
    [" 012345 ", "012345"],
  ])("reads %j as %s", (input, code) => {
    expect(mfaCode(input)).toBe(code);
  });

  it.each(["", "12345", "1234567", "12345a", "１２３４５６"])("refuses %j", (input) => {
    expect(mfaCode(input)).toBeNull();
  });
});

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

describe("mfaAlert and mfaFormOff", () => {
  const all: MfaStatus[] = ["preparing", "unprepared", "ready", "verifying", "wrong-code", "rate-limited", "failed", "expired", "verified"];

  it("marks each refusal or failure, and only those, as an alert", () => {
    expect(all.filter(mfaAlert)).toEqual(["unprepared", "wrong-code", "rate-limited", "failed", "expired"]);
  });

  it("turns the form off while there is nothing to verify, a verify runs, or it is done", () => {
    expect(all.filter(mfaFormOff)).toEqual(["preparing", "unprepared", "verifying", "expired", "verified"]);
  });
});
