import type { GoTrueMFAApi } from "@supabase/supabase-js";
import { isInvalidSession } from "@/lib/auth-errors";

export type EnrolledFactor = { factorId: string; qrCode: string; secret: string };

// The enroll step's new factor (Phase 9 plan step 5c), through the MFA API of the client it
// is given: the browser's `supabaseClient` in `useMfa`, a session client in the integration
// test (`tests/integration/admin-auth.test.ts`). The code step needs none: the page has the
// verified factor's id from `mfaStepAllowed`.
//
// It first removes a factor an abandoned enroll left, then enrolls one. An unverified
// factor fills the one slot (`max_enrolled_factors = 1`): an enroll beside one was refused
// 422 `too_many_enrolled_mfa_factors`, and an `aal1` session may unenroll it (local stack,
// IS #381 and the PR for IS #382). So each visit to the step gives a new QR code.
//
// `expired` when Auth says the session is gone (`isInvalidSession`), `null` when it refused
// otherwise or couldn't be reached.
export async function enrollFactor(
  mfa: Pick<GoTrueMFAApi, "listFactors" | "unenroll" | "enroll">,
): Promise<EnrolledFactor | "expired" | null> {
  const failed = (error: unknown) => (isInvalidSession(error) ? "expired" : null);
  try {
    // `all` holds unverified factors too; `totp` lists verified ones only (local stack, the
    // PR for IS #382).
    const { data: factors, error } = await mfa.listFactors();
    if (error) return failed(error);

    for (const factor of factors.all) {
      if (factor.status !== "unverified") continue;
      const { error: unenrollError } = await mfa.unenroll({ factorId: factor.id });
      if (unenrollError) return failed(unenrollError);
    }

    const { data, error: enrollError } = await mfa.enroll({
      factorType: "totp",
      issuer: "WhereIsFood",
      friendlyName: "WhereIsFood",
    });
    if (enrollError) return failed(enrollError);
    return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
  } catch (err) {
    console.error("[mfa] the enroll threw:", err);
    return null;
  }
}
