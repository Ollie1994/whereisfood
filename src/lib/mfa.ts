import type { GoTrueMFAApi } from "@supabase/supabase-js";
import type { MfaStep } from "@/lib/services/admin-auth";

export type PreparedFactor = { factorId: string; qrCode: string | null; secret: string | null };

// The factor the TOTP step verifies (Phase 9 plan step 5c), through the MFA API of the
// client it is given: the browser's `supabaseClient` in `useMfa`, a session client in the
// integration test (`tests/integration/admin-auth.test.ts`).
//
// `enroll`: first removes a factor an abandoned enroll left, then enrolls one. An unverified
// factor fills the one slot (`max_enrolled_factors = 1`): an enroll beside one was refused
// 422 `too_many_enrolled_mfa_factors`, and an `aal1` session may unenroll it (local stack,
// IS #381 and the PR for IS #382). So each visit to the step gives a new QR code.
// `code`: the user's verified factor.
//
// `null` when Auth refused or couldn't be reached.
export async function prepareFactor(
  mfa: Pick<GoTrueMFAApi, "listFactors" | "unenroll" | "enroll">,
  step: MfaStep,
): Promise<PreparedFactor | null> {
  try {
    const { data: factors, error } = await mfa.listFactors();
    if (error) return null;

    if (step === "code") {
      // `totp` lists verified factors only; `all` holds the unverified ones too (local stack,
      // the PR for IS #382).
      const factor = factors.totp[0];
      return factor ? { factorId: factor.id, qrCode: null, secret: null } : null;
    }

    for (const factor of factors.all) {
      if (factor.status !== "unverified") continue;
      const { error: unenrollError } = await mfa.unenroll({ factorId: factor.id });
      if (unenrollError) return null;
    }

    const { data, error: enrollError } = await mfa.enroll({
      factorType: "totp",
      issuer: "WhereIsFood",
      friendlyName: "WhereIsFood",
    });
    if (enrollError) return null;
    return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
  } catch {
    return null;
  }
}
