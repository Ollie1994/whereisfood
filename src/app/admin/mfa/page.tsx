import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import MfaForm from "@/components/Admin/MfaForm";
import { MFA_TEXTS, SESSION_CHECK_FAILED } from "@/lib/login";
import { mfaStepAllowed, type MfaStep } from "@/lib/services/admin-auth";
import { createSessionClient, readOnlyCookies } from "@/lib/supabase-session";

// The TOTP step (Phase 9 plan step 5c, open decision 5): the one admin page besides the
// login that an `aal1` session reaches. Behind the proxy, which has just run the same check and refreshed the
// session; this run picks the step: the enroll while the user has no verified factor (the
// enroll window), the code once one exists.
export default async function MfaPage() {
  const store = await cookies();
  const supabase = createSessionClient(readOnlyCookies(store));
  const check = await mfaStepAllowed({
    cookieNames: store.getAll().map(({ name }) => name),
    auth: supabase.auth,
    now: new Date(),
  });

  if (!check.ok) {
    if (check.reason === "done") redirect("/admin");
    // Not "logged out" (plan #32): the layout's `LogoutButton` is the way out.
    if (check.reason === "unavailable") {
      return (
        <>
          <h1 className="text-2xl font-semibold">{MFA_TEXTS.unavailableTitle}</h1>
          <p role="alert" className="text-sm text-foreground/70">{SESSION_CHECK_FAILED}</p>
        </>
      );
    }
    redirect("/admin/login");
  }

  const enroll = check.step === "enroll";
  const step: MfaStep = enroll ? { step: "enroll" } : { step: "code", factorId: check.factorId };
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{enroll ? MFA_TEXTS.enrollTitle : MFA_TEXTS.codeTitle}</h1>
        <p className="text-sm text-foreground/70">{enroll ? MFA_TEXTS.enrollIntro : MFA_TEXTS.codeIntro}</p>
      </div>
      {/* Keyed by its factor, so a new step or factor mounts a new form (`useMfa` reads it once). */}
      <MfaForm key={step.step === "code" ? step.factorId : "enroll"} check={step} />
    </>
  );
}
