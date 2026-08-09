import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { EmailPayload } from "@/lib/types";
import {
  extractTruckIdFromRecipient,
  validateEmailPayload,
  verifyMailgunSignature,
} from "@/lib/validators/email";

const TRUCK_ID = "11111111-1111-1111-1111-111111111111";
const SIGNING_KEY = "test-signing-key";

// Build a payload whose signature is a genuine HMAC over (timestamp + token),
// exactly as Mailgun signs it — so verifyMailgunSignature has a real round-trip.
function signedPayload(overrides: Partial<EmailPayload> = {}): EmailPayload {
  const timestamp = overrides.timestamp ?? "1700000000";
  const token = overrides.token ?? "0123456789abcdef";
  const signature =
    overrides.signature ??
    createHmac("sha256", SIGNING_KEY).update(timestamp + token).digest("hex");
  return {
    recipient: `${TRUCK_ID}@in.yourapp.se`,
    "body-plain": "Vi står vid Järntorget idag 11-14",
    timestamp,
    token,
    signature,
    ...overrides,
  };
}

describe("verifyMailgunSignature", () => {
  it("returns true for a correct signature", () => {
    expect(verifyMailgunSignature(signedPayload(), SIGNING_KEY)).toBe(true);
  });

  it("returns false when the token is tampered (signature no longer matches)", () => {
    const p = signedPayload();
    expect(verifyMailgunSignature({ ...p, token: "tampered" }, SIGNING_KEY)).toBe(false);
  });

  it("returns false when the timestamp is tampered", () => {
    const p = signedPayload();
    expect(verifyMailgunSignature({ ...p, timestamp: "9999999999" }, SIGNING_KEY)).toBe(false);
  });

  it("returns false for a tampered (but correct-length) signature", () => {
    const p = signedPayload();
    // Flip the last hex char, preserving the 64-char length so the length guard
    // passes and the constant-time comparison itself is exercised.
    const flipped = p.signature.slice(0, -1) + (p.signature.at(-1) === "0" ? "1" : "0");
    expect(verifyMailgunSignature({ ...p, signature: flipped }, SIGNING_KEY)).toBe(false);
  });

  it("returns false for the wrong signing key", () => {
    expect(verifyMailgunSignature(signedPayload(), "wrong-key")).toBe(false);
  });

  it("returns false for a wrong-length signature without throwing", () => {
    const p = signedPayload();
    expect(() => verifyMailgunSignature({ ...p, signature: "short" }, SIGNING_KEY)).not.toThrow();
    expect(verifyMailgunSignature({ ...p, signature: "short" }, SIGNING_KEY)).toBe(false);
  });
});

describe("extractTruckIdFromRecipient", () => {
  it("returns the uuid for a valid {uuid}@in.yourapp.se address", () => {
    expect(extractTruckIdFromRecipient(`${TRUCK_ID}@in.yourapp.se`)).toBe(TRUCK_ID);
  });

  it("normalizes an upper-case uuid and domain to lower-case", () => {
    expect(extractTruckIdFromRecipient(`${TRUCK_ID.toUpperCase()}@IN.YOURAPP.SE`)).toBe(TRUCK_ID);
  });

  it("returns null for the wrong domain", () => {
    expect(extractTruckIdFromRecipient(`${TRUCK_ID}@in.wrong.se`)).toBeNull();
  });

  it("returns null for a non-uuid local part", () => {
    expect(extractTruckIdFromRecipient("not-a-uuid@in.yourapp.se")).toBeNull();
  });

  it("returns null when there is no @", () => {
    expect(extractTruckIdFromRecipient(TRUCK_ID)).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(extractTruckIdFromRecipient("")).toBeNull();
  });
});

describe("validateEmailPayload", () => {
  const validObj = (): Record<string, string> => ({
    recipient: `${TRUCK_ID}@in.yourapp.se`,
    "body-plain": "hej",
    timestamp: "1700000000",
    token: "tok",
    signature: "deadbeef",
  });

  it("returns a typed payload for valid input", () => {
    const result = validateEmailPayload(validObj());
    expect(result).not.toBeNull();
    expect(result?.recipient).toBe(`${TRUCK_ID}@in.yourapp.se`);
  });

  it("accepts any non-empty timestamp, including odd widths", () => {
    // Deliberately loose. An earlier revision pinned this to exactly 10 digits to
    // disambiguate the signed `timestamp + token` boundary, but that rejected
    // validly-signed payloads outright and reintroduced permanent data loss.
    // The replay index keys on the concatenation instead, which is invariant
    // across every re-split — a structural defence that costs no mail.
    for (const odd of ["170000000", "17000000000", "1700000000.5", "abcdefghij"]) {
      expect(validateEmailPayload({ ...validObj(), timestamp: odd })).not.toBeNull();
    }

    // Still required to be present and non-empty.
    expect(validateEmailPayload({ ...validObj(), timestamp: "" })).toBeNull();
  });

  it("accepts an empty body-plain (HTML-only mail still stores a row)", () => {
    const result = validateEmailPayload({ ...validObj(), "body-plain": "" });
    expect(result).not.toBeNull();
    expect(result?.["body-plain"]).toBe("");
  });

  it("returns null when a required HMAC field is missing", () => {
    const { signature, ...withoutSignature } = validObj();
    void signature;
    expect(validateEmailPayload(withoutSignature as Record<string, string>)).toBeNull();
  });

  it("returns null for an empty recipient", () => {
    expect(validateEmailPayload({ ...validObj(), recipient: "" })).toBeNull();
  });
});
