import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { mfaCode, mfaStatusFor, type MfaStatus } from "@/lib/login";
import { enrollFactor } from "@/lib/mfa";
import type { MfaStep } from "@/lib/services/admin-auth";
import { supabaseClient } from "@/lib/supabase-browser";

// The TOTP step's state (Phase 9 plan step 5c), through `supabaseClient`, which is for Auth
// only (`CLAUDE.md`, "Supabase"). The page decided the step on the server
// (`mfaStepAllowed`); these calls go from the browser to Auth, which the page doesn't bind
// (plan #14's limit). The enroll step's factor comes from `enrollFactor`, the code step's
// from the page. A verify that passes raises the session to `aal2`, which `supabaseClient`
// writes to the cookies, and the page is replaced by `/admin`, whose request carries them.
export function useMfa(step: MfaStep): {
  status: MfaStatus;
  qrCode: string | null;
  secret: string | null;
  code: string;
  setCode: (code: string) => void;
  invalid: boolean;
  submit: () => Promise<void>;
} {
  const router = useRouter();
  const [status, setStatus] = useState<MfaStatus>(step.step === "code" ? "ready" : "preparing");
  const [factorId, setFactorId] = useState<string | null>(step.step === "code" ? step.factorId : null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCodeState] = useState("");
  // Whether the last submit was refused here for not being six digits; typing clears it.
  const [invalid, setInvalid] = useState(false);
  // Once per page: React's dev mode runs an effect twice on mount, and two enrolls at once
  // would race for the one slot. A ref keeps its value across that second run.
  const started = useRef(false);
  // One verify at a time, read from a ref, so it holds even for a `submit` that runs before
  // React re-renders with the new `status`.
  const verifying = useRef(false);

  const enroll = step.step === "enroll";
  useEffect(() => {
    if (!enroll || started.current) return;
    started.current = true;
    void enrollFactor(supabaseClient.auth.mfa).then((enrolled) => {
      if (!enrolled) return setStatus("unprepared");
      setFactorId(enrolled.factorId);
      setQrCode(enrolled.qrCode);
      setSecret(enrolled.secret);
      setStatus("ready");
    });
  }, [enroll]);

  function setCode(next: string) {
    setCodeState(next);
    setInvalid(false);
  }

  async function submit() {
    if (!factorId || verifying.current || status === "verified" || status === "expired") return;
    const digits = mfaCode(code);
    setInvalid(digits === null);
    if (digits === null) return;

    verifying.current = true;
    setStatus("verifying");
    let next: MfaStatus;
    try {
      const { error } = await supabaseClient.auth.mfa.challengeAndVerify({ factorId, code: digits });
      next = mfaStatusFor(error);
    } catch {
      next = "failed";
    }
    // Still set once verified, so no second verify starts while the browser leaves.
    if (next !== "verified") verifying.current = false;
    setStatus(next);
    if (next === "verified") router.replace("/admin");
  }

  return { status, qrCode, secret, code, setCode, invalid, submit };
}
