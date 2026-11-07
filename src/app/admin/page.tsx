import { cookies } from "next/headers";
import Link from "next/link";
import { SESSION_CHECK_FAILED, isTemporaryAuthError } from "@/lib/login";
import { createSessionClient, readOnlyCookies } from "@/lib/supabase-session";

// Minimal until #223 adds the gate and later steps the data: it shows only who is
// logged in, so the phone checkpoint (#224) can see the login worked. No `is_admin`
// check yet, so it must show no data (plan step 2). Until #223's proxy refreshes the
// session first, this page's read can refresh it and lose the new tokens
// (`readOnlyCookies` says what was probed).
export default async function AdminPage() {
  const supabase = createSessionClient(readOnlyCookies(await cookies()));
  const { data, error } = await supabase.auth.getUser();
  const email = data.user?.email;

  // An Auth failure isn't "logged out" (plan #32): say so, rather than offer the login.
  if (isTemporaryAuthError(error)) {
    return (
      <>
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p role="alert" className="text-sm text-foreground/70">{SESSION_CHECK_FAILED}</p>
      </>
    );
  }

  if (!email) {
    return (
      <>
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="text-sm text-foreground/70">Du är inte inloggad.</p>
        <Link href="/admin/login" className="text-sm underline">
          Logga in
        </Link>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">Admin</h1>
      <p className="text-sm text-foreground/70">Inloggad som {email}.</p>
    </>
  );
}
