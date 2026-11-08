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

// A missing or invalid session, as opposed to Auth failing (#32). auth-js 2.106.2
// (`dist/main`): `_getUser` answers `AuthSessionMissingError` when storage holds no access
// token, and `handleError` (`lib/fetch.js`) turns Auth's `session_not_found` into one too.
// Any other answer Auth gave with a 4xx status is an `AuthApiError` about the token it was
// sent (a bad JWT, a used refresh token), except 429, which is a rate limit. A failed
// fetch, a 5xx, a 429 or an unknown error is "unavailable".
function isInvalidSession(error: unknown): boolean {
  if (isAuthSessionMissingError(error)) return true;
  return isAuthApiError(error) && error.status >= 400 && error.status < 500 && error.status !== 429;
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
