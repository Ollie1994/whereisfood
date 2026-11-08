import { isAuthApiError, isAuthSessionMissingError } from "@supabase/supabase-js";
import { getUserById } from "@/lib/db/users";

// Is this request the admin's? (Phase 7 plan, #13, #14, #32.) No HTTP knowledge:
// `withAdmin` and the proxy pass the cookie names and a `getUser` built from a session
// client, so this file never sees a request.

// The session cookie `@supabase/ssr` writes: `sb-<project>-auth-token`, or its chunks
// `…-auth-token.0`, `.1`, … when the value is long (`@supabase/ssr`'s `utils/chunker.js`,
// `${key}.${i}`; the key is supabase-js's `sb-${hostname.split(".")[0]}-auth-token`). Not
// `…-auth-token-code-verifier`, which a login in progress leaves and which holds no
// session.
const SESSION_COOKIE = /^sb-.+-auth-token(\.\d+)?$/;

export function hasSessionCookie(names: readonly string[]): boolean {
  return names.some((name) => SESSION_COOKIE.test(name));
}

export type AdminCheck =
  | { ok: true; userId: string }
  | { ok: false; reason: "no-session" | "not-admin" | "unavailable" };

// What `supabase.auth.getUser()` answers, as far as this file reads it.
export type GetUser = () => Promise<{
  data: { user: { id: string } | null };
  error: unknown;
}>;

// Auth's codes that say the session itself is bad. Seen on the local stack (PR for
// IS #223): a malformed access token → 403 `bad_jwt`; a deleted user → 403
// `user_not_found`; an expired session whose refresh token Auth doesn't know → 400
// `refresh_token_not_found`. From auth-js's `ErrorCode` list (`lib/error-codes.d.ts`), not
// seen: `refresh_token_already_used` (a reused token was still accepted 11 s later, past
// `config.toml`'s 10 s reuse interval) and `session_expired`.
//
// Not a status range: a 4xx that isn't about the token, such as a gateway refusing the
// anon key, would send the admin to the login (#32). Not `validation_failed`, which a
// malformed refresh token gave, but which Auth uses for any bad request.
//
// A limit: a bad session answered with a code not listed here (`user_banned`, or one Auth
// adds later) reads as "unavailable", so the browser shows the error page, not the login,
// and keeps its cookies. `/admin/login` stays reachable, and its logout clears them.
const INVALID_SESSION_CODES = new Set([
  "bad_jwt",
  "user_not_found",
  "refresh_token_not_found",
  "refresh_token_already_used",
  "session_expired",
]);

// A missing or invalid session, as opposed to Auth failing (#32). auth-js 2.106.2
// (`dist/main`): `_getUser` answers `AuthSessionMissingError` when storage holds no access
// token (a cookie that isn't a session, and a signed-out session, both gave it locally),
// and `handleError` (`lib/fetch.js`) turns Auth's `session_not_found` into one too.
// Anything else (a failed fetch, a 5xx, a 429, another code) is "unavailable".
function isInvalidSession(error: unknown): boolean {
  if (isAuthSessionMissingError(error)) return true;
  return isAuthApiError(error) && error.code !== undefined && INVALID_SESSION_CODES.has(error.code);
}

// In this order, each step only when the one before passed (`project-context.md`, "Admin
// and auth"): a session cookie, with no network or DB call before it; then `getUser()`,
// which asks Auth to verify the session; then `is_admin` through the db layer. An auth
// user with no `users` row is not an admin.
export async function requireAdmin({
  cookieNames,
  getUser,
}: {
  cookieNames: readonly string[];
  getUser: GetUser;
}): Promise<AdminCheck> {
  if (!hasSessionCookie(cookieNames)) return { ok: false, reason: "no-session" };

  let userId: string;
  try {
    const { data, error } = await getUser();
    if (error) return { ok: false, reason: isInvalidSession(error) ? "no-session" : "unavailable" };
    if (!data.user) return { ok: false, reason: "no-session" };
    userId = data.user.id;
  } catch (err) {
    console.error("[admin-auth] getUser threw:", err);
    return { ok: false, reason: "unavailable" };
  }

  try {
    const user = await getUserById(userId);
    return user?.is_admin ? { ok: true, userId } : { ok: false, reason: "not-admin" };
  } catch (err) {
    console.error("[admin-auth] reading the users row failed:", err);
    return { ok: false, reason: "unavailable" };
  }
}
