import { isAuthApiError, isAuthSessionMissingError } from "@supabase/supabase-js";
import { getUserById } from "@/lib/db/users";

// Is this request the admin's? (Phase 7 plan, #13, #14, #32; Phase 9 plan, #11, #13, #14.)
// No HTTP knowledge: `withAdmin`, the proxy and the MFA page pass the cookie names and the
// session client's `auth`, so this file never sees a request.

// The session cookie `@supabase/ssr` writes: `sb-<project>-auth-token`, or its chunks
// `…-auth-token.0`, `.1`, … when the value is long (`@supabase/ssr`'s `utils/chunker.js`,
// `${key}.${i}`; the key is supabase-js's `sb-${hostname.split(".")[0]}-auth-token`). Not
// `…-auth-token-code-verifier`, which a login in progress leaves and which holds no
// session.
const SESSION_COOKIE = /^sb-.+-auth-token(\.\d+)?$/;

export function hasSessionCookie(names: readonly string[]): boolean {
  return names.some((name) => SESSION_COOKIE.test(name));
}

type Refused = "no-session" | "not-admin" | "unavailable";

// `needs-mfa`: a valid admin session that hasn't passed TOTP yet (`aal1`), told apart from
// `no-session` (Phase 9 plan, open decision 6).
export type AdminCheck = { ok: true; userId: string } | { ok: false; reason: Refused | "needs-mfa" };

// What the MFA page shows an `aal1` admin: the enroll while the user has no verified factor
// (the enroll window, plan step 5b), the code once one exists. `done`: already `aal2`.
export type MfaStep = "enroll" | "code";
export type MfaCheck = { ok: true; step: MfaStep } | { ok: false; reason: Refused | "done" };

// The session client's `auth`, as far as this file uses it (supabase-js's
// `SupabaseAuthClient` passes as it is).
export type SessionAuth = {
  getSession(): Promise<{ data: { session: { access_token: string } | null }; error: unknown }>;
  getUser(jwt: string): Promise<{
    data: { user: { id: string; factors?: readonly { status: string }[] } | null };
    error: unknown;
  }>;
  signOut(options: { scope: "local" }): Promise<{ error: unknown }>;
};

// Auth's codes that say the session itself is bad. Seen on the local stack (PR for
// IS #223): a malformed access token → 403 `bad_jwt`; a deleted user → 403
// `user_not_found`; an expired session whose refresh token Auth doesn't know → 400
// `refresh_token_not_found`. From auth-js's `ErrorCode` list (`lib/error-codes.d.ts`), not
// seen: `refresh_token_already_used` (a reused token was still accepted 11 s later, past
// `config.toml`'s 10 s reuse interval), `session_expired` and `user_banned`.
//
// Not a status range: a 4xx that isn't about the token, such as a gateway refusing the
// anon key, would send the admin to the login (#32). Not `validation_failed`, which a
// malformed refresh token gave, but which Auth uses for any bad request.
//
// A limit: a bad session answered with a code not listed here (one Auth adds later) reads
// as "unavailable", so the browser shows the error page, not the login, and keeps its
// cookies (the proxy carries no deletion then). `/admin/login`'s logout clears them.
const INVALID_SESSION_CODES = new Set([
  "bad_jwt",
  "user_not_found",
  "refresh_token_not_found",
  "refresh_token_already_used",
  "session_expired",
  "user_banned",
]);

// A missing or invalid session, as opposed to Auth failing (#32). auth-js 2.106.2
// (`dist/main`): `getUser` answers `AuthSessionMissingError` when storage holds no access
// token (a cookie that isn't a session, and a signed-out session, both gave it locally),
// and `handleError` (`lib/fetch.js`) turns Auth's `session_not_found` into one too.
// Anything else (a failed fetch, a 5xx, a 429, another code) is "unavailable".
function isInvalidSession(error: unknown): boolean {
  if (isAuthSessionMissingError(error)) return true;
  return isAuthApiError(error) && error.code !== undefined && INVALID_SESSION_CODES.has(error.code);
}

// The first factors `requireAdmin` admits: the PKCE magic link only (Phase 9 plan, #14, the
// owner, IS #396). A directly verified code (a typed or guessed one, `generateLink`'s hashed
// token) gives `otp`, and a password login `password`, so both are refused.
const FIRST_FACTORS = new Set(["magiclink"]);

// The `amr` methods a second factor adds. After a TOTP verify `amr` holds `totp` and the
// first factor, in either order (IS #381's probe gave `[totp, magiclink]`; four of five runs of
// PR #404's test gave `[magiclink, totp]`), so the first factor is found by its method.
const MFA_METHODS = new Set(["totp"]);

type Claims = { aal: unknown; amr: unknown };

// The payload of a token Auth has just accepted (`getUser(token)` below), so reading it
// here reads what Auth verified, not a cookie's claim (#11). A payload this can't read
// gives `null`, which no check below admits.
function claimsOf(token: string): Claims | null {
  try {
    const payload: unknown = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
    return typeof payload === "object" && payload !== null ? (payload as Claims) : null;
  } catch {
    return null;
  }
}

// The session's first factor allowed: exactly one `amr` entry that isn't an MFA method,
// and its method in `FIRST_FACTORS`. Entries are `{ method, timestamp }` on the local stack
// (IS #381); RFC 8176's plain strings, which auth-js's types also allow, read as no method,
// so they are refused, not admitted.
function firstFactorAllowed(claims: Claims | null): boolean {
  if (!claims || !Array.isArray(claims.amr)) return false;
  const methods = claims.amr.map((entry: unknown) =>
    typeof entry === "object" && entry !== null ? (entry as { method?: unknown }).method : undefined,
  );
  const first = methods.filter((method) => !(typeof method === "string" && MFA_METHODS.has(method)));
  return first.length === 1 && typeof first[0] === "string" && FIRST_FACTORS.has(first[0]);
}

// Ends this session at Auth and clears it from storage (`signOut`'s `_removeSession`, which
// a writing cookie adapter turns into deletions). A failure is logged, not answered: the
// caller refuses the session either way.
async function endSession(auth: SessionAuth, why: string): Promise<void> {
  try {
    const { error } = await auth.signOut({ scope: "local" });
    if (error) console.error(`[admin-auth] signOut (${why}) answered with an error:`, error);
  } catch (err) {
    console.error(`[admin-auth] signOut (${why}) threw:`, err);
  }
}

type Verified = { ok: true; userId: string; aal2: boolean; hasVerifiedFactor: boolean };

// In this order, each step only when the one before passed (`project-context.md`, "Admin
// and auth", with Phase 9 plan step 5b's first factor and `aal2`): a session cookie, with no network or DB call before it; the session's access
// token (`getSession`, which refreshes an expiring one and writes the rotated cookies), then
// `getUser(token)`, which asks Auth to verify that token, so a logged-out or forged one is
// refused (open decision 11); the first factor, from that same token; then `is_admin`
// through the db layer. An auth user with no `users` row is not an admin.
async function verify({ cookieNames, auth }: { cookieNames: readonly string[]; auth: SessionAuth }): Promise<
  Verified | { ok: false; reason: Refused }
> {
  if (!hasSessionCookie(cookieNames)) return { ok: false, reason: "no-session" };

  let token: string;
  let user: { id: string; factors?: readonly { status: string }[] };
  try {
    const session = await auth.getSession();
    if (session.error) return { ok: false, reason: isInvalidSession(session.error) ? "no-session" : "unavailable" };
    if (!session.data.session) return { ok: false, reason: "no-session" };
    token = session.data.session.access_token;

    const { data, error } = await auth.getUser(token);
    if (error) {
      if (!isInvalidSession(error)) return { ok: false, reason: "unavailable" };
      // `getUser()` with no token clears a signed-out session from storage; with one it
      // doesn't (auth-js 2.106.2, `_getUser`), so the signOut does, as before.
      if (isAuthSessionMissingError(error)) await endSession(auth, "a session Auth no longer has");
      return { ok: false, reason: "no-session" };
    }
    if (!data.user) return { ok: false, reason: "no-session" };
    user = data.user;
  } catch (err) {
    console.error("[admin-auth] reading the session threw:", err);
    return { ok: false, reason: "unavailable" };
  }

  const claims = claimsOf(token);
  if (!firstFactorAllowed(claims)) {
    // Signed out at Auth, so a session the app refuses can't stay valid there (plan #14).
    await endSession(auth, "a first factor outside the allowlist");
    return { ok: false, reason: "no-session" };
  }

  try {
    const row = await getUserById(user.id);
    if (!row?.is_admin) return { ok: false, reason: "not-admin" };
  } catch (err) {
    console.error("[admin-auth] reading the users row failed:", err);
    return { ok: false, reason: "unavailable" };
  }

  return {
    ok: true,
    userId: user.id,
    aal2: claims?.aal === "aal2",
    hasVerifiedFactor: (user.factors ?? []).some((factor) => factor.status === "verified"),
  };
}

// The admin, at `aal2` (Phase 9 plan step 5b). An `aal1` admin session is `needs-mfa`.
export async function requireAdmin(input: { cookieNames: readonly string[]; auth: SessionAuth }): Promise<AdminCheck> {
  const check = await verify(input);
  if (!check.ok) return check;
  return check.aal2 ? { ok: true, userId: check.userId } : { ok: false, reason: "needs-mfa" };
}

// The MFA page's gate: an `aal1` admin session whose first factor is the magic link, and
// which step it gets. It gates the app's page only: the enroll and verify calls go from the
// browser to Auth (`useMfa`), so a session that skips the page isn't stopped by this (plan
// #14's limit). Auth itself refused a second enroll beside a verified factor
// (`too_many_enrolled_mfa_factors`, `max_enrolled_factors = 1`, IS #381).
export async function mfaStepAllowed(input: { cookieNames: readonly string[]; auth: SessionAuth }): Promise<MfaCheck> {
  const check = await verify(input);
  if (!check.ok) return check;
  if (check.aal2) return { ok: false, reason: "done" };
  return { ok: true, step: check.hasVerifiedFactor ? "code" : "enroll" };
}
