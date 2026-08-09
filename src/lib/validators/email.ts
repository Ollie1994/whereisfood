import { createHmac, timingSafeEqual } from "node:crypto";
import type { EmailPayload } from "@/lib/types";
import { isUuid } from "@/lib/validators/uuid";

// Inbound address is {uuid}@in.yourapp.se. Hardcoded per Open Decision #1 (single
// domain; a one-line change when the real Mailgun inbound domain is registered in
// Phase 8). Validators must not read process.env, so this is a const, not env.
const INBOUND_DOMAIN = "in.yourapp.se";

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

// Mailgun signs `timestamp + token` with NO delimiter, so an unconstrained
// timestamp makes the boundary ambiguous: the same signed string can be re-split
// at any interior index and every split verifies under the SAME signature. With a
// 10-digit timestamp and a 32-char token that is 41 valid re-splits, each yielding
// a different `token` value — enough to walk straight past a token-keyed replay
// guard. Verified experimentally.
//
// Pinning the timestamp to exactly 10 digits makes the split unique: length 10
// implies split index 10, which is the original boundary and the only one.
// 10 digits covers Unix seconds from 2001-09-09 to 2286-11-20.
const UNIX_SECONDS_10_DIGITS = /^\d{10}$/;

// Pure shape validation for the Mailgun inbound payload. The route converts the
// multipart/form-data fields to a plain object before calling this. Returns a
// typed EmailPayload or null. body-plain may be empty (HTML-only mail still stores
// a row); recipient and the three HMAC fields must be present and non-empty.
export function validateEmailPayload(obj: Record<string, string>): EmailPayload | null {
  if (typeof obj !== "object" || obj === null) return null;

  const recipient = obj.recipient;
  const bodyPlain = obj["body-plain"];
  const timestamp = obj.timestamp;
  const token = obj.token;
  const signature = obj.signature;

  if (!isNonEmptyString(recipient)) return null;
  if (typeof bodyPlain !== "string") return null; // present, may be empty
  // Exactly 10 digits — not merely non-empty. See UNIX_SECONDS_10_DIGITS: a loose
  // timestamp lets an attacker re-split the signed `timestamp + token` string and
  // bypass the token replay guard with a signature they never had to forge.
  if (!isNonEmptyString(timestamp) || !UNIX_SECONDS_10_DIGITS.test(timestamp)) {
    return null;
  }
  if (!isNonEmptyString(token)) return null;
  if (!isNonEmptyString(signature)) return null;

  return {
    recipient,
    "body-plain": bodyPlain,
    timestamp,
    token,
    signature,
  };
}

// Constant-time HMAC verification. signingKey is passed in (never read from env
// here). Mailgun signs HMAC-SHA256(timestamp + token) with the signing key and
// sends the hex digest as `signature`. Compare the hex strings as bytes with a
// length guard, so timingSafeEqual never throws on a length mismatch and a wrong
// signature can't be distinguished by timing.
export function verifyMailgunSignature(payload: EmailPayload, signingKey: string): boolean {
  const expected = createHmac("sha256", signingKey)
    .update(payload.timestamp + payload.token)
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "utf8");
  const signatureBuf = Buffer.from(payload.signature, "utf8");

  if (expectedBuf.length !== signatureBuf.length) return false;
  return timingSafeEqual(expectedBuf, signatureBuf);
}

// Parse the truck_id from a {uuid}@in.yourapp.se recipient. Returns the normalized
// (lowercase) UUID for a valid address, or null for any malformed one (missing @,
// wrong domain, non-UUID local part). Domain comparison is case-insensitive.
export function extractTruckIdFromRecipient(recipient: string): string | null {
  if (typeof recipient !== "string") return null;

  const at = recipient.indexOf("@");
  if (at === -1) return null;

  const local = recipient.slice(0, at);
  const domain = recipient.slice(at + 1);

  if (domain.toLowerCase() !== INBOUND_DOMAIN) return null;
  if (!isUuid(local)) return null;

  return local.toLowerCase();
}
