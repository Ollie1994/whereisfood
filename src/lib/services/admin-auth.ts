import { getUserById } from "@/lib/db/users";
import { isInvalidSession } from "@/lib/auth-errors";

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
// (the enroll window, plan step 5b), the code once one exists, with that factor's id.
// `done`: already `aal2`.
export type MfaStep = { step: "enroll" } | { step: "code"; factorId: string };
export type MfaCheck = ({ ok: true } & MfaStep) | { ok: false; reason: Refused | "done" };

// The session client's `auth`, as far as this file uses it (supabase-js's
// `SupabaseAuthClient` passes as it is).
export type SessionAuth = {
  getSession(): Promise<{ data: { session: { access_token: string } | null }; error: unknown }>;
  getUser(jwt: string): Promise<{
    data: { user: { id: string; factors?: readonly { id: string; status: string }[] } | null };
    error: unknown;
  }>;
  signOut(options: { scope: "local" }): Promise<{ error: unknown }>;
};

// The first factors `requireAdmin` admits: the PKCE magic link only (Phase 9 plan, #14, the
// owner, IS #396). A directly verified code (a typed or guessed one, `generateLink`'s hashed
// token) gives `otp`, and a password login `password`, so both are refused.
const FIRST_FACTORS = new Set(["magiclink"]);

// The `amr` methods a second factor adds. After a TOTP verify `amr` holds `totp` and the
// first factor, in either order (IS #381's probe gave `[totp, magiclink]`; four of five runs of
// PR #404's test gave `[magiclink, totp]`), so the first factor is found by its method.
const MFA_METHODS = new Set(["totp"]);

type Claims = { aal: unknown; amr: unknown; iat?: unknown };

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

// How long a session lasts, from its first factor's sign-in (Phase 9 plan step 6, #4, open
// decision 2: 12 hours, the owner, 2026-11-18). Supabase's own session timeouts are Pro's,
// which replace this in Phase 11.
export const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

// The session's first factor's sign-in, in epoch seconds, if the factor is allowed: exactly
// one `amr` entry that isn't an MFA method, its method in `FIRST_FACTORS`, with a finite
// numeric `timestamp` (`JSON.parse` gives `Infinity` for `1e400`, so `typeof` alone isn't
// enough). Entries are `{ method, timestamp }` on the local stack (IS #381); RFC 8176's
// plain strings, which auth-js's types also allow, read as no method, so they are refused,
// not admitted. `null`: refused.
function firstFactorSignIn(claims: Claims | null): number | null {
  if (!claims || !Array.isArray(claims.amr)) return null;
  const entries = claims.amr.map((entry: unknown) =>
    typeof entry === "object" && entry !== null ? (entry as { method?: unknown; timestamp?: unknown }) : {},
  );
  const first = entries.filter(({ method }) => !(typeof method === "string" && MFA_METHODS.has(method)));
  if (first.length !== 1) return null;
  const [{ method, timestamp }] = first;
  if (typeof method !== "string" || !FIRST_FACTORS.has(method)) return null;
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) return null;
  return timestamp;
}

// Past the time-box: measured from the first factor's sign-in, never the newest `amr` entry,
// since a later TOTP verify adds a fresh one, and the holder of a session mustn't reset the
// bound by verifying again (#4). The first factor's entry kept its timestamp through a refresh
// (IS #377) and a later verify (IS #381's probe).
//
// The age is read on the later of two clocks: the caller's `now`, and the token's `iat`
// (Auth's clock when it issued the token, which Auth has just verified). When Auth's clock
// runs ahead of this server's, the age is then Auth's, so the skew doesn't lengthen the box;
// a fresh session's `iat` is at or after its sign-in on the same clock, so its age starts
// near zero. A token without a finite numeric `iat` is read on `now` alone. The owner's
// call: the plan's open decision 2.
//
// Three limits:
// - While Auth runs ahead, the age is read at the token's issue, not at Auth's time now, so a
//   session can pass the 12 hours by up to its token's age: `getSession` refreshes a token
//   that is about to expire, and `config.toml`'s `jwt_expiry` is 3600 s.
// - While Auth runs behind by D, the sign-in is D behind `now` and `iat` doesn't help, so the
//   box is D shorter; at D of 12 hours, every new login is refused at once. The local stack's
//   Docker VM clock can fall behind the host's after a sleep (`helpers.ts`'s `authClock`).
// - Each check reads its caller's `now`. A request the proxy admits just under 12 hours can be
//   refused by `withAdmin` or the MFA page just after. Their sign-out ends the session at Auth,
//   but they hold `readOnlyCookies`, which can't delete cookies (the integration test of the
//   MFA step shows the cookie left). The browser keeps the dead ones until a request through
//   the proxy to an admin path other than the login, which the proxy lets through unchecked,
//   clears them (`getUser(token)`, the integration test's logged-out case), or a new login's
//   callback writes new ones.
function expired(signedInSeconds: number, issuedAt: unknown, now: Date): boolean {
  const authNow = typeof issuedAt === "number" && Number.isFinite(issuedAt) ? issuedAt * 1000 : -Infinity;
  return Math.max(now.getTime(), authNow) - signedInSeconds * 1000 >= SESSION_MAX_AGE_MS;
}

// Ends this session at Auth and clears it from storage (`signOut`'s `_removeSession`, which
// a writing cookie adapter turns into deletions). Whether it did: auth-js 2.106.2's
// `_signOut` answers no error for Auth's 401, 403 or 404 (a session already gone) and
// returns any other error before `_removeSession`, so then the session may still be valid.
async function endSession(auth: SessionAuth, why: string): Promise<boolean> {
  try {
    const { error } = await auth.signOut({ scope: "local" });
    if (!error) return true;
    console.error(`[admin-auth] signOut (${why}) answered with an error:`, error);
  } catch (err) {
    console.error(`[admin-auth] signOut (${why}) threw:`, err);
  }
  return false;
}

// `verifiedFactorId`: the user's verified factor, if any. TOTP is the only factor type
// `config.toml` turns on, and `max_enrolled_factors = 1` allows one.
type Verified = { ok: true; userId: string; aal2: boolean; verifiedFactorId: string | null };

// What `requireAdmin` and `mfaStepAllowed` take. `now`: the caller's clock (`CLAUDE.md`,
// "Time"), which the time-box reads.
export type AdminInput = { cookieNames: readonly string[]; auth: SessionAuth; now: Date };

// In this order, each step only when the one before passed (`project-context.md`, "Admin
// and auth", with Phase 9 plan steps 5b and 6): a session cookie, with no network or DB call
// before it; the session's access token (`getSession`, which refreshes an expiring one and
// writes the rotated cookies), then `getUser(token)`, which asks Auth to verify that token,
// so a logged-out or forged one is refused (open decision 11); the first factor, from that
// same token, and the time-box from its sign-in; then `is_admin` through the db layer. An
// auth user with no `users` row is not an admin.
async function verify({ cookieNames, auth, now }: AdminInput): Promise<Verified | { ok: false; reason: Refused }> {
  if (!hasSessionCookie(cookieNames)) return { ok: false, reason: "no-session" };

  let token: string;
  let user: { id: string; factors?: readonly { id: string; status: string }[] };
  try {
    const session = await auth.getSession();
    if (session.error) return { ok: false, reason: isInvalidSession(session.error) ? "no-session" : "unavailable" };
    if (!session.data.session) return { ok: false, reason: "no-session" };
    token = session.data.session.access_token;

    const { data, error } = await auth.getUser(token);
    if (error) return { ok: false, reason: isInvalidSession(error) ? "no-session" : "unavailable" };
    if (!data.user) return { ok: false, reason: "no-session" };
    user = data.user;
  } catch (err) {
    console.error("[admin-auth] reading the session threw:", err);
    return { ok: false, reason: "unavailable" };
  }

  // A refused session is signed out at Auth, so it can't stay valid there (plan #14, #4).
  // If that failed, "unavailable": the session isn't gone, and a later request tries again.
  const claims = claimsOf(token);
  const signedIn = firstFactorSignIn(claims);
  let refusedFor: string | null = null;
  if (signedIn === null) refusedFor = "a first factor outside the allowlist";
  else if (expired(signedIn, claims?.iat, now)) refusedFor = "a session past the time-box";
  if (refusedFor) {
    const ended = await endSession(auth, refusedFor);
    return { ok: false, reason: ended ? "no-session" : "unavailable" };
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
    verifiedFactorId: user.factors?.find((factor) => factor.status === "verified")?.id ?? null,
  };
}

// The admin, at `aal2` (Phase 9 plan step 5b). An `aal1` admin session is `needs-mfa`.
export async function requireAdmin(input: AdminInput): Promise<AdminCheck> {
  const check = await verify(input);
  if (!check.ok) return check;
  return check.aal2 ? { ok: true, userId: check.userId } : { ok: false, reason: "needs-mfa" };
}

// The MFA page's gate: an `aal1` admin session whose first factor is the magic link, and
// which step it gets. It gates the app's page only: the enroll and verify calls go from the
// browser to Auth (`useMfa`), so a session that skips the page isn't stopped by this (plan
// #14's limit). Auth itself refused a second enroll beside a verified factor
// (`too_many_enrolled_mfa_factors`, `max_enrolled_factors = 1`, IS #381).
export async function mfaStepAllowed(input: AdminInput): Promise<MfaCheck> {
  const check = await verify(input);
  if (!check.ok) return check;
  if (check.aal2) return { ok: false, reason: "done" };
  return check.verifiedFactorId
    ? { ok: true, step: "code", factorId: check.verifiedFactorId }
    : { ok: true, step: "enroll" };
}
