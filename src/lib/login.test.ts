import { describe, expect, it } from "vitest";
import { callbackErrorMessage, loginMessage, loginStatusFor, type LoginStatus } from "@/lib/login";

describe("loginStatusFor", () => {
  it("is sent when Auth answers with no error", () => {
    expect(loginStatusFor(null)).toBe("sent");
  });

  it("answers an unknown email as sent, so the form doesn't reveal accounts", () => {
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
});

describe("callbackErrorMessage", () => {
  it("explains a failed link", () => {
    expect(callbackErrorMessage("link")).toMatch(/Inloggningslänken fungerade inte/);
  });

  it("is null for no error and for anything else", () => {
    expect(callbackErrorMessage(undefined)).toBeNull();
    expect(callbackErrorMessage("other")).toBeNull();
    expect(callbackErrorMessage(["link", "link"])).toBeNull();
  });
});
