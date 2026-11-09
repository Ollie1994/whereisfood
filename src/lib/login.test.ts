import { describe, expect, it } from "vitest";
import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import {
  callbackErrorMessage,
  isTemporaryAuthError,
  loginMessage,
  loginStatusFor,
  type LoginStatus,
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

  it("says to open the link in this browser, copying it on a phone (IS #240)", () => {
    const sent = loginMessage("sent");
    expect(sent).toMatch(/i den här webbläsaren/);
    expect(sent).toMatch(/kopiera/);
    expect(sent).toMatch(/mejlappen/);
    expect(sent).not.toMatch(/enheten/);
  });
});

describe("callbackErrorMessage", () => {
  it("explains a failed link", () => {
    expect(callbackErrorMessage("link")).toMatch(/Inloggningslänken fungerade inte/);
  });

  it("sends a failed link back to the usual browser, copying it on a phone (IS #240)", () => {
    const link = callbackErrorMessage("link");
    expect(link).toMatch(/en annan webbläsare/);
    expect(link).toMatch(/Be om en ny i din vanliga webbläsare/);
    expect(link).toMatch(/kopiera/);
    expect(link).toMatch(/mejlappen/);
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
