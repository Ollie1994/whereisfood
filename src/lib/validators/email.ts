import { createHmac, timingSafeEqual } from "node:crypto";
import type { EmailPayload } from "@/lib/types";

// Inbound address is {uuid}@in.yourapp.se. Hardcoded per Open Decision #1 (single
// domain; a one-line change when the real Mailgun inbound domain is registered in
// Phase 8). Validators must not read process.env, so this is a const, not env.
const INBOUND_DOMAIN = "in.yourapp.se";

// 8-4-4-4-12 hex, any UUID version (matches the ingest validator — see note there).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

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
  if (!isNonEmptyString(timestamp)) return null;
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
  if (!UUID_RE.test(local)) return null;

  return local.toLowerCase();
}
