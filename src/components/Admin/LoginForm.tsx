"use client";

import { useLogin } from "@/hooks/useLogin";
import { loginMessage } from "@/lib/login";

export default function LoginForm({ linkError }: { linkError: string | null }) {
  const { email, setEmail, status, submit } = useLogin();
  const sending = status === "sending";
  const message = loginMessage(status);

  return (
    <form
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
          className="rounded-md border border-zinc-300 px-3 py-3 text-base"
        />
      </label>

      <button
        type="submit"
        disabled={sending}
        className="rounded-md bg-zinc-900 px-4 py-3 text-base font-medium text-white disabled:opacity-60"
      >
        {sending ? "Skickar…" : "Skicka inloggningslänk"}
      </button>

      {message && (
        <p role="status" className="text-sm text-zinc-700">
          {message}
        </p>
      )}
    </form>
  );
}
