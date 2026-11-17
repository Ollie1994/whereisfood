// An access token whose payload holds `claims`, for unit tests that stub Auth's `getUser`
// or `fetch`. Unsigned ("sig"): the real Auth's check of the signature is the integration
// test's forged-claim case (`tests/integration/admin-auth.test.ts`).
export function unsignedJwt(claims: object): string {
  return ["e30", Buffer.from(JSON.stringify(claims)).toString("base64url"), "sig"].join(".");
}

// `amr` entries as Auth writes them (`{ method, timestamp }`, IS #381).
export const LINK = { method: "magiclink", timestamp: 1 };
export const TOTP = { method: "totp", timestamp: 2 };
