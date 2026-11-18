// An access token whose payload holds `claims`, for unit tests that stub Auth's `getUser`
// or `fetch`. Unsigned ("sig"): the real Auth's check of the signature is the integration
// test's forged-claim case (`tests/integration/admin-auth.test.ts`).
export function unsignedJwt(claims: object): string {
  return ["e30", Buffer.from(JSON.stringify(claims)).toString("base64url"), "sig"].join(".");
}

// When `LINK`'s session signed in, in epoch seconds: as this file loads, so a test on the
// real clock is inside the session time-box (`admin-auth.ts`'s `SESSION_MAX_AGE_MS`).
export const SIGNED_IN = Math.floor(Date.now() / 1000);

// `amr` entries as Auth writes them (`{ method, timestamp }`, IS #381).
export const LINK = { method: "magiclink", timestamp: SIGNED_IN };
export const TOTP = { method: "totp", timestamp: SIGNED_IN + 1 };
