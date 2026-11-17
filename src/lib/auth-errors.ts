import { isAuthApiError, isAuthSessionMissingError } from "@supabase/supabase-js";

// Which Auth answers mean the session itself is missing or bad, for the server's
// `requireAdmin` and the browser's TOTP step alike: no server imports here.

// Auth's codes that say the session itself is bad. Seen on the local stack (PR for
// IS #223): a malformed access token → 403 `bad_jwt`; a deleted user → 403
// `user_not_found`; an expired session whose refresh token Auth doesn't know → 400
// `refresh_token_not_found`. A request with no bearer token → 401 `no_authorization`, and
// one with only the anon key, as auth-js 2.106.2's MFA calls send with no stored session →
// 403 `bad_jwt` (`curl` of a factor's `/challenge`, the PR for IS #382). From auth-js's
// `ErrorCode` list (`lib/error-codes.d.ts`), not seen: `refresh_token_already_used` (a
// reused token was still accepted 11 s later, past `config.toml`'s 10 s reuse interval),
// `session_expired` and `user_banned`.
//
// Not a status range: a 4xx that isn't about the token, such as a gateway refusing the
// anon key, would send the admin to the login (Phase 7 plan #32). Not `validation_failed`,
// which a malformed refresh token gave, but which Auth uses for any bad request.
//
// A limit: a bad session answered with a code not listed here (one Auth adds later) reads
// as "unavailable" in `requireAdmin`, so the browser shows the error page, not the login,
// and keeps its cookies (the proxy carries no deletion then); `/admin/login`'s logout
// clears them. On the TOTP step it reads as "failed".
const INVALID_SESSION_CODES = new Set([
  "bad_jwt",
  "no_authorization",
  "user_not_found",
  "refresh_token_not_found",
  "refresh_token_already_used",
  "session_expired",
  "user_banned",
]);

// A missing or invalid session, as opposed to Auth failing (#32): `requireAdmin`'s
// "no-session", the TOTP step's "expired". auth-js 2.106.2 (`dist/main`): `getUser` answers
// `AuthSessionMissingError` when storage holds no access token (a cookie that isn't a
// session, and a signed-out session, both gave it locally), and `handleError`
// (`lib/fetch.js`) turns Auth's `session_not_found` into one too. Anything else (a failed
// fetch, a 5xx, a 429, another code) isn't.
export function isInvalidSession(error: unknown): boolean {
  if (isAuthSessionMissingError(error)) return true;
  return isAuthApiError(error) && error.code !== undefined && INVALID_SESSION_CODES.has(error.code);
}
