"use client";

import MfaCode from "@/components/Admin/MfaCode";
import MfaEnroll from "@/components/Admin/MfaEnroll";
import { useMfa } from "@/hooks/useMfa";
import type { MfaStep } from "@/lib/services/admin-auth";

// The TOTP step the page chose: the enroll's QR code first when `step` is `enroll`, then
// the code. State lives in `useMfa`.
export default function MfaForm({ step }: { step: MfaStep }) {
  const { status, qrCode, secret, code, setCode, invalid, submit } = useMfa(step);
  return (
    <div className="flex flex-col gap-6">
      {step === "enroll" && <MfaEnroll qrCode={qrCode} secret={secret} />}
      <MfaCode status={status} code={code} setCode={setCode} invalid={invalid} submit={submit} />
    </div>
  );
}
