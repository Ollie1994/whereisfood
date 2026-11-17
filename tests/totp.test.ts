import { describe, expect, it } from "vitest";
import { base32Decode, totp } from "./totp";

// RFC 6238, Appendix B: the SHA-1 seed is the ASCII "12345678901234567890", here in base32,
// and each code has 8 digits with a 30-second step.
const SEED = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("totp", () => {
  it.each([
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ])("gives RFC 6238's SHA-1 code at %i seconds", (seconds, code) => {
    expect(totp(SEED, seconds * 1000, { digits: 8 })).toBe(code);
  });

  it("keeps the last 6 digits by default, leading zeros included", () => {
    expect(totp(SEED, 1111111109 * 1000)).toBe("081804");
  });

  it("gives one code across a 30-second step and another after it", () => {
    expect(totp(SEED, 59_999)).toBe(totp(SEED, 30_000));
    expect(totp(SEED, 60_000)).not.toBe(totp(SEED, 59_999));
  });
});

describe("base32Decode", () => {
  it("decodes RFC 4648's base32 vector, ignoring padding and case", () => {
    expect(base32Decode("MZXW6YTBOI======").toString()).toBe("foobar");
    expect(base32Decode("mzxw6ytboi").toString()).toBe("foobar");
  });

  it("decodes the RFC 6238 seed", () => {
    expect(base32Decode(SEED).toString()).toBe("12345678901234567890");
  });

  it("throws on a character outside base32", () => {
    expect(() => base32Decode("MZXW1")).toThrow("not base32");
  });
});
