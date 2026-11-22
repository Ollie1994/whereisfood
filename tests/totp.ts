import { createHmac } from "node:crypto";

// A TOTP code (RFC 6238) for the integration tests' fixture factors, on Node's `crypto`,
// not a library (Phase 9 plan #9, the owner's call: no dependency to audit or update).
// Checked against RFC 6238's SHA-1 vectors in `totp.test.ts`. Test code only: the app never
// computes a code, and holds a factor's secret only in the enroll step's page while it is
// open (`src/lib/mfa.ts`, `useMfa`).

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

// RFC 4648 base32, as Auth gives a TOTP factor's secret. Padding and case are ignored; any
// other character throws.
export function base32Decode(text: string): Buffer {
  const clean = text.replace(/=+$/, "").toUpperCase();
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) throw new Error(`base32Decode: not base32: ${JSON.stringify(char)}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

// The code for `secret` at `time` (epoch milliseconds): HMAC-SHA-1 over the count of
// `period`-second steps since the epoch, dynamically truncated to `digits` digits.
export function totp(secret: string, time: number, { digits = 6, period = 30 } = {}): string {
  const counter = Math.floor(time / 1000 / period);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", base32Decode(secret)).update(message).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, "0");
}
