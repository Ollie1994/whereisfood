"use client";

import { useLogin } from "@/hooks/useLogin";
import { RESEND_NOTE, loginMessage } from "@/lib/login";

export default function LoginForm({ linkError }: { linkError: string | null }) {
  const { email, setEmail, status, submit, resend } = useLogin();
  const sending = status === "sending";
  const sent = status === "sent";
  const message = loginMessage(status);

  // `post`: if the page's script hasn't run, the browser submits the form itself. As the
  // default GET it put the email in the URL and the dev server's log (`/admin/login?email=…`,
  // the owner's browser check, PR for IS #222). A plain POST to this page renders it again
  // (probed on `next start`).
  return (
    <form
      method="post"
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {linkError && status === "idle" && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {linkError}
        </p>
      )}

      <label className="flex flex-col gap-1 text-sm font-medium">
        E-postadress
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="rounded-md border border-foreground/30 bg-background px-3 py-3 text-base"
        />
      </label>

      {!sent && (
        <button
          type="submit"
          disabled={sending}
          className="rounded-md bg-foreground px-4 py-3 text-base font-medium text-background disabled:opacity-60"
        >
          {sending ? "Skickar…" : "Skicka inloggningslänk"}
        </button>
      )}

      {message && (
        <p role="status" className="text-sm text-foreground/70">
          {message}
        </p>
      )}

      {sent && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={resend}
            className="rounded-md border border-foreground/30 px-4 py-3 text-base"
          >
            Skicka en ny länk
          </button>
          <p className="text-sm text-foreground/70">{RESEND_NOTE}</p>
        </div>
      )}
    </form>
  );
}
