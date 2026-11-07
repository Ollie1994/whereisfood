// The login form's states and their Swedish text, kept pure so they are tested without a
// browser. `useLogin` runs the request; `LoginForm` renders what this returns.

export type LoginStatus = "idle" | "sending" | "sent" | "rate-limited" | "failed";

// What Auth answered to `signInWithOtp`, reduced to a status. Codes seen on the local
// stack (2026-11-07, PR for IS #222): an unknown email with `shouldCreateUser: false`
// gets 422 `otp_disabled`; a second request within `max_frequency` gets 429
// `over_email_send_rate_limit`.
//
// `otp_disabled` reads as "sent", the same text as a real send. That doesn't hide which
// emails have accounts: the browser calls Auth directly, and its answer shows there.
export function loginStatusFor(error: { status?: number; code?: string } | null): LoginStatus {
  if (!error) return "sent";
  if (error.code === "otp_disabled") return "sent";
  if (error.status === 429 || error.code === "over_email_send_rate_limit") return "rate-limited";
  return "failed";
}

export function loginMessage(status: LoginStatus): string | null {
  switch (status) {
    case "sent":
      return "Om adressen har ett konto har vi skickat en inloggningslänk. Öppna den på den här enheten.";
    case "rate-limited":
      return "För många försök. Vänta en stund och försök igen.";
    case "failed":
      return "Det gick inte att skicka länken. Försök igen.";
    default:
      return null;
  }
}

// `/auth/callback` sends a failed login back with `?error=link`.
export function callbackErrorMessage(error: string | string[] | undefined): string | null {
  return error === "link"
    ? "Inloggningslänken fungerade inte. Den kan ha gått ut eller redan använts. Be om en ny."
    : null;
}
