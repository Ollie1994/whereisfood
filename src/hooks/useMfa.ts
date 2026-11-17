import { useEffect, useRef, useState } from "react";
import { mfaAlert, mfaCode, mfaFormOff, mfaStatusFor, type MfaStatus } from "@/lib/login";
import { enrollFactor } from "@/lib/mfa";
import type { MfaStep } from "@/lib/services/admin-auth";
import { supabaseClient } from "@/lib/supabase-browser";

// The TOTP step's state (Phase 9 plan step 5c), through `supabaseClient`, which is for Auth
// only (`CLAUDE.md`, "Supabase"). The page decided the step on the server
// (`mfaStepAllowed`); these calls go from the browser to Auth, which the page doesn't bind
// (plan #14's limit). The enroll step's factor comes from `enrollFactor`, the code step's
// from the page. A verify that passes raises the session to `aal2`, which `supabaseClient`
// writes to the cookies, and the browser loads `/admin` afresh: a full load, so if `/admin`
// sent it back here the step would start over, not keep "verified" with the form off.
export function useMfa(check: MfaStep): {
  status: MfaStatus;
  qrCode: string | null;
  secret: string | null;
  code: string;
  setCode: (code: string) => void;
  invalid: boolean;
  submit: () => Promise<void>;
} {
  // Read once: the page keys `MfaForm` by its factor, so a new one mounts a new hook.
  const [status, setStatus] = useState<MfaStatus>(check.step === "code" ? "ready" : "preparing");
  const [factorId, setFactorId] = useState<string | null>(check.step === "code" ? check.factorId : null);
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

  const enroll = check.step === "enroll";
  useEffect(() => {
    if (!enroll || started.current) return;
    started.current = true;
    void enrollFactor(supabaseClient.auth.mfa).then((enrolled) => {
      if (enrolled === "expired") return setStatus("expired");
      if (!enrolled) return setStatus("unprepared");
      setFactorId(enrolled.factorId);
      setQrCode(enrolled.qrCode);
      setSecret(enrolled.secret);
      setStatus("ready");
    });
  }, [enroll]);

  // Typing a new code clears the format alert and an earlier attempt's answer ("Fel kod", a
  // failure), which isn't about the new input.
  function setCode(next: string) {
    setCodeState(next);
    setInvalid(false);
    if (mfaAlert(status) && !mfaFormOff(status)) setStatus("ready");
  }

  async function submit() {
    if (!factorId || verifying.current || mfaFormOff(status)) return;
    const digits = mfaCode(code);
    setInvalid(digits === null);
    if (digits === null) {
      // The last attempt's answer ("Fel kod", a failure) isn't about this input, which never
      // reached Auth (the owner's browser check showed both under a three-digit code).
      if (mfaAlert(status)) setStatus("ready");
      return;
    }

    verifying.current = true;
    setStatus("verifying");
    let next: MfaStatus;
    try {
      const { error } = await supabaseClient.auth.mfa.challengeAndVerify({ factorId, code: digits });
      next = mfaStatusFor(error);
    } catch (err) {
      console.error("[mfa] the verify threw:", err);
      next = "failed";
    }
    // Still set once verified, so no second verify starts while the browser leaves.
    if (next !== "verified") verifying.current = false;
    setStatus(next);
    if (next === "verified") window.location.replace("/admin");
  }

  return { status, qrCode, secret, code, setCode, invalid, submit };
}
