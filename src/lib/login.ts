import { isAuthPKCECodeVerifierMissingError, isAuthRetryableFetchError } from "@supabase/supabase-js";
import { isInvalidSession } from "@/lib/auth-errors";

// The login form's states and their Swedish text, kept pure so they are tested without a
// browser. `useLogin` runs the request; `LoginForm` renders what this returns.

export type LoginStatus = "idle" | "sending" | "sent" | "rate-limited" | "failed";

// What Auth answered to `signInWithOtp`, reduced to a status. Codes seen on the local
// stack (2026-11-07, PR for IS #222): an unknown email with `shouldCreateUser: false`
// gets 422 `otp_disabled`; a second request within `max_frequency` gets 429
// `over_email_send_rate_limit`.
//
// `otp_disabled` reads as "sent", the same text as a real send. That doesn't hide which
// emails have accounts: the browser calls Auth directly, and its answer shows there; and
// two quick sends show "För många försök" only for a real account (local stack, two
// back-to-back sends each: an unknown email 422 then 422, a real one 200 then 429).
export function loginStatusFor(error: { status?: number; code?: string } | null): LoginStatus {
  if (!error) return "sent";
  if (error.code === "otp_disabled") return "sent";
  if (error.status === 429 || error.code === "over_email_send_rate_limit") return "rate-limited";
  return "failed";
}

export function loginMessage(status: LoginStatus): string | null {
  switch (status) {
    // The browser, not the device: on the phone a link tapped in the Gmail app opened in a
    // browser without the PKCE verifier cookie and failed twice; copied into Chrome, where
    // the login page was, it worked (IS #224's checkpoint).
    case "sent":
      return "Om adressen har ett konto har vi skickat en inloggningslänk. Öppna den i den här webbläsaren. På mobilen: kopiera länken och klistra in den i adressfältet här, i stället för att trycka på den i mejlappen.";
    // Even a refused send replaces the PKCE code verifier (`signInWithOtp` stores a new one
    // before the request, `@supabase/auth-js` 2.106.2), so earlier links stop working.
    case "rate-limited":
      return "För många försök. Vänta en stund och skicka sedan en ny länk. Länkar du redan har fått fungerar inte längre.";
    // A failed send replaces or removes the verifier too (its `catch` removes it).
    case "failed":
      return "Det gick inte att skicka länken. Försök igen om en stund. Länkar du redan har fått fungerar inte längre.";
    default:
      return null;
  }
}

// Shown beside "Skicka en ny länk" once a link is sent: the new one replaces it.
export const RESEND_NOTE = "En ny länk gör den förra ogiltig.";

// An Auth answer that says nothing about the link or the session: Auth unreachable, a
// 429, or a 5xx. `isAuthRetryableFetchError` covers a failed fetch and auth-js's
// `NETWORK_ERROR_CODES` (502–504, 520–524, 530, `lib/fetch.js`). The inverse rule,
// "unavailable unless the session is missing or invalid", is `requireAdmin`'s
// (`src/lib/services/admin-auth.ts`, plan #32), through `isInvalidSession`
// (`src/lib/auth-errors.ts`).
export function isTemporaryAuthError(error: { status?: number } | null): boolean {
  if (!error) return false;
  return isAuthRetryableFetchError(error) || error.status === 429 || (error.status ?? 0) >= 500;
}

// Why `/auth/callback` sends a failed login back to the login page, as its `?error=`.
export type CallbackError = "link" | "browser" | "unavailable";

// Auth's answer to a verifier that doesn't match the code: 400 and this code, on the local
// stack (`auth-routes.test.ts`, a real emailed code with another login's verifier).
const WRONG_VERIFIER = "bad_code_verifier";

export function callbackErrorFor(error: { status?: number; code?: string }): CallbackError {
  // This browser's PKCE verifier doesn't belong to the link: none stored, which auth-js
  // 2.106.2 reports before any request (`AuthPKCECodeVerifierMissingError`; #224's phone
  // failure, `auth-routes.test.ts`), or another one (`WRONG_VERIFIER`). The right browser
  // gets these too after a refused or failed send, which replaces or removes its verifier
  // (`loginMessage`'s comments), so the text names that cause too. A link that a later
  // send superseded fails at `/verify` first (`/auth/callback`'s header, `otp_expired`).
  // Not covered by the text: a code reused in the browser whose exchange already removed
  // its verifier (`_exchangeCodeForSession`).
  if (isAuthPKCECodeVerifierMissingError(error) || error.code === WRONG_VERIFIER) return "browser";
  // Auth down or failing isn't the link's fault: say so, so the admin doesn't spend one
  // of the built-in email's few sends an hour on a new link (plan #32's reasoning).
  if (isTemporaryAuthError(error)) return "unavailable";
  return "link";
}

// `/auth/logout`'s `?error=` when its global sign-out failed: this device's cookies are gone,
// but Auth may not have ended the user's other sessions (Phase 9 plan, #5).
export const LOGOUT_FAILED_ERROR = "logout";
export const LOGOUT_FAILED_PATH = `/admin/login?error=${LOGOUT_FAILED_ERROR}` as const;

// Every `?error=` the login page reads: the callback's and the logout's. The table below is
// keyed by it, so a value added to either has no text until one is written (`tsc`).
export type LoginError = CallbackError | typeof LOGOUT_FAILED_ERROR;

const LOGIN_ERROR_TEXT: Record<LoginError, string> = {
  link: "Inloggningslänken fungerade inte. Den kan ha gått ut eller redan använts. Be om en ny.",
  // Shown in the browser the link opened in, which may be the wrong one, so it sends the
  // admin back to their usual browser for the new link (IS #240). A new link, not the same
  // one: `/verify` uses a link up on its first visit (the `unavailable` text's comment).
  browser:
    "Inloggningslänken fungerade inte i den här webbläsaren. Den kan ha öppnats i en annan webbläsare än den som bad om den, eller slutat gälla när en ny länk begärdes. Be om en ny i din vanliga webbläsare och öppna den där. På mobilen: kopiera den dit i stället för att trycka på den i mejlappen.",
  // Not "open the same link again": Auth's `/verify` uses a link up on its first visit
  // (local stack: a second visit to the same link answered `?error=access_denied`,
  // "Email link is invalid or has expired", PR #236 round 5).
  unavailable: "Inloggningen gick inte att slutföra just nu. Vänta en stund och be sedan om en ny länk.",
  // The owner's wording (2026-11-18, IS #385). A fresh login's logout signs out again with
  // `scope: "global"`.
  logout:
    "Utloggningen kunde inte slutföras, så andra enheter kan fortfarande vara inloggade. Logga in och logga ut igen.",
};

// Is this `?error=` value one the login page has a text for?
export function isLoginError(error: unknown): error is LoginError {
  return typeof error === "string" && Object.hasOwn(LOGIN_ERROR_TEXT, error);
}

// The text for a `?error=` value, or `null` for none or one this page doesn't know.
export function loginErrorMessage(error: string | string[] | undefined): string | null {
  return isLoginError(error) ? LOGIN_ERROR_TEXT[error] : null;
}

// `/admin` when Auth couldn't say whether the session is valid.
export const SESSION_CHECK_FAILED = "Det gick inte att kontrollera inloggningen just nu. Ladda om sidan om en stund.";

// The admin page besides the login that an `aal1` session reaches, for the TOTP enroll and
// the code (Phase 9 plan, open decision 5, the owner): `/auth/callback` lands a login here,
// and the proxy sends an `aal1` session here from every other admin page but the login.
export const MFA_PATH = "/admin/mfa";

// Logout's form: `LogoutButton`'s, and the proxy's 503 page's, which can't render a
// component. One copy, so both post to the same route with the same label.
export const LOGOUT_PATH = "/auth/logout";
export const LOGOUT_LABEL = "Logga ut";

// The TOTP step's states (`useMfa`; Phase 9 plan step 5c). `preparing`: the enroll step's
// enroll is under way (the code step starts `ready`, with the factor the page read);
// `unprepared`: the enroll failed, so there is nothing to verify; `replaced`: the factor is
// gone (another visit to the enroll step replaced it, or it was deleted, Phase 9 plan #13's
// recovery), so the key shown is dead and a reload starts the step again; `expired`: the `aal1`
// session is gone (`isInvalidSession`), so only a new login helps.
export type MfaStatus =
  | "preparing"
  | "unprepared"
  | "ready"
  | "verifying"
  | "wrong-code"
  | "rate-limited"
  | "failed"
  | "replaced"
  | "expired"
  | "verified";

// What Auth answered to `challengeAndVerify`, reduced to a status. A wrong code: 422
// `mfa_verification_failed`, "Invalid TOTP code entered" (local stack, the PR for IS #382).
// A session that is gone (`isInvalidSession`): a verify on another device ends the user's
// `aal1` sessions (IS #381's probe). A factor that is gone: 404 `mfa_factor_not_found`,
// as for one another visit to the enroll step replaced (local stack, the PR for IS #382).
export function mfaStatusFor(error: { status?: number; code?: string } | null): MfaStatus {
  if (!error) return "verified";
  if (isInvalidSession(error)) return "expired";
  if (error.code === "mfa_factor_not_found") return "replaced";
  if (error.code === "mfa_verification_failed") return "wrong-code";
  if (error.status === 429) return "rate-limited";
  return "failed";
}

// Each status's flags, one row per status, so a status added to `MfaStatus` and not here
// fails `tsc`. `alert`: its message is a refusal or a failure, not a progress note;
// `formOff`: the code field and button take nothing; `keyHidden`: the enroll's QR code and
// key are dead or moot (the factor or the session is gone, or the enroll failed).
const MFA_FLAGS: Record<MfaStatus, { alert: boolean; formOff: boolean; keyHidden: boolean }> = {
  preparing: { alert: false, formOff: true, keyHidden: false },
  unprepared: { alert: true, formOff: true, keyHidden: true },
  ready: { alert: false, formOff: false, keyHidden: false },
  verifying: { alert: false, formOff: true, keyHidden: false },
  "wrong-code": { alert: true, formOff: false, keyHidden: false },
  "rate-limited": { alert: true, formOff: false, keyHidden: false },
  failed: { alert: true, formOff: false, keyHidden: false },
  replaced: { alert: true, formOff: true, keyHidden: true },
  expired: { alert: true, formOff: true, keyHidden: true },
  verified: { alert: false, formOff: true, keyHidden: false },
};

export function mfaAlert(status: MfaStatus): boolean {
  return MFA_FLAGS[status].alert;
}

export function mfaKeyShown(status: MfaStatus): boolean {
  return !MFA_FLAGS[status].keyHidden;
}

export function mfaFormOff(status: MfaStatus): boolean {
  return MFA_FLAGS[status].formOff;
}

export function mfaMessage(status: MfaStatus): string | null {
  switch (status) {
    case "preparing":
      return "Förbereder…";
    case "unprepared":
      return "Det gick inte att förbereda inloggningen. Ladda om sidan om en stund.";
    case "wrong-code":
      return "Fel kod. Kontrollera att koden kommer från WhereIsFood i appen och försök igen.";
    case "rate-limited":
      return "För många försök. Vänta en stund och försök igen.";
    case "failed":
      return "Det gick inte att kontrollera koden just nu. Försök igen om en stund.";
    case "replaced":
      return "Nyckeln gäller inte längre, till exempel för att sidan har öppnats igen i en annan flik. Ladda om sidan.";
    case "expired":
      return "Inloggningen har gått ut. Logga in igen.";
    case "verified":
      return "Klart. Öppnar admin…";
    default:
      return null;
  }
}

// The six digits TOTP gives here (the enroll's URI: SHA1, 6 digits, 30 s, IS #381), with
// the spaces an app shows between groups taken out. `null` for anything else.
export function mfaCode(input: string): string | null {
  const code = input.replace(/\s/g, "");
  return /^\d{6}$/.test(code) ? code : null;
}

// The TOTP step's fixed texts.
export const MFA_TEXTS = {
  enrollTitle: "Lägg till tvåstegsverifiering",
  enrollIntro:
    "Skanna QR-koden med en autentiseringsapp i telefonen, till exempel Google Authenticator eller Microsoft Authenticator. Skriv sedan in koden som appen visar.",
  qrAlt: "QR-kod att skanna med autentiseringsappen",
  secretNote: "Går det inte att skanna? Lägg till kontot i appen med den här nyckeln:",
  codeTitle: "Ange kod",
  unavailableTitle: "Tvåstegsverifiering",
  codeIntro: "Skriv in den sexsiffriga koden som autentiseringsappen visar för WhereIsFood.",
  codeLabel: "Kod",
  invalidCode: "Koden ska vara sex siffror.",
  loginAgain: "Logga in",
  submit: "Bekräfta",
  submitting: "Bekräftar…",
} as const;
