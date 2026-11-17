import { useEffect, useRef, useState } from "react";
import { mfaCode, mfaStatusFor, type MfaStatus } from "@/lib/login";
import { prepareFactor } from "@/lib/mfa";
import type { MfaStep } from "@/lib/services/admin-auth";
import { supabaseClient } from "@/lib/supabase-browser";

// The TOTP step's state (Phase 9 plan step 5c), through `supabaseClient`, which is for Auth
// only (`CLAUDE.md`, "Supabase"). The page decided the step on the server
// (`mfaStepAllowed`); these calls go from the browser to Auth, which the page doesn't bind
// (plan #14's limit). The factor comes from `prepareFactor`; a verify that passes raises the
// session to `aal2`, which `supabaseClient` writes to the cookies, and the browser goes on
// to `/admin`.
export function useMfa(step: MfaStep): {
  status: MfaStatus;
  qrCode: string | null;
  secret: string | null;
  code: string;
  setCode: (code: string) => void;
  invalid: boolean;
  submit: () => Promise<void>;
} {
  const [status, setStatus] = useState<MfaStatus>("preparing");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  // Whether the last submit was refused here for not being six digits.
  const [invalid, setInvalid] = useState(false);
  // Once per page: React's dev mode runs an effect twice on mount, and two enrolls at once
  // would race for the one slot. A ref keeps its value across that second run.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void prepareFactor(supabaseClient.auth.mfa, step).then((prepared) => {
      if (!prepared) return setStatus("unprepared");
      setFactorId(prepared.factorId);
      setQrCode(prepared.qrCode);
      setSecret(prepared.secret);
      setStatus("ready");
    });
  }, [step]);

  async function submit() {
    if (!factorId || status === "verifying" || status === "verified") return;
    const digits = mfaCode(code);
    setInvalid(digits === null);
    if (digits === null) return;

    setStatus("verifying");
    let next: MfaStatus;
    try {
      const { error } = await supabaseClient.auth.mfa.challengeAndVerify({ factorId, code: digits });
      next = mfaStatusFor(error);
    } catch {
      next = "failed";
    }
    setStatus(next);
    if (next === "verified") window.location.assign("/admin");
  }

  return { status, qrCode, secret, code, setCode, invalid, submit };
}
