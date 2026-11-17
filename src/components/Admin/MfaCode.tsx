import Link from "next/link";
import { MFA_TEXTS, mfaAlert, mfaFormOff, mfaMessage, type MfaStatus } from "@/lib/login";

// The code input and its answer. `one-time-code` lets the phone offer a code it has.
export default function MfaCode({
  status,
  code,
  setCode,
  invalid,
  submit,
}: {
  status: MfaStatus;
  code: string;
  setCode: (code: string) => void;
  invalid: boolean;
  submit: () => Promise<void>;
}) {
  const message = mfaMessage(status);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <label className="flex flex-col gap-1 text-sm font-medium">
        {MFA_TEXTS.codeLabel}
        <input
          type="text"
          name="code"
          required
          autoComplete="one-time-code"
          inputMode="numeric"
          maxLength={7}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          aria-invalid={invalid}
          className="rounded-md border border-foreground/30 bg-background px-3 py-3 text-base tracking-widest"
        />
      </label>
      {invalid && (
        <p role="alert" className="text-sm text-red-700">
          {MFA_TEXTS.invalidCode}
        </p>
      )}

      <button
        type="submit"
        disabled={mfaFormOff(status)}
        className="rounded-md bg-foreground px-4 py-3 text-base font-medium text-background disabled:opacity-60"
      >
        {status === "verifying" ? MFA_TEXTS.submitting : MFA_TEXTS.submit}
      </button>

      {message && (
        <p role={mfaAlert(status) ? "alert" : "status"} className="text-sm text-foreground/70">
          {message}
        </p>
      )}
      {status === "expired" && (
        <Link href="/admin/login" className="text-sm underline">
          {MFA_TEXTS.loginAgain}
        </Link>
      )}
    </form>
  );
}
