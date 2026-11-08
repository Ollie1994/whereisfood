import { cookies } from "next/headers";
import Link from "next/link";
import { SESSION_CHECK_FAILED } from "@/lib/login";
import { createSessionClient, readOnlyCookies } from "@/lib/supabase-session";

// Minimal until later steps add the data: it shows only who is logged in, so the phone
// checkpoint (#224) can see the login worked. Behind the proxy, which lets only an admin
// through and refreshes the session first, so this read sees fresh tokens
// (`src/proxy.ts`; `readOnlyCookies` says why that matters).
export default async function AdminPage() {
  const supabase = createSessionClient(readOnlyCookies(await cookies()));
  const { data, error } = await supabase.auth.getUser();
  const email = data.user?.email;

  // The proxy has just verified this session, so any error here isn't "logged out" (plan
  // #32): say so, rather than offer the login. Not only `isTemporaryAuthError`'s errors:
  // a 401 with no code isn't one of them, and `requireAdmin` reads it as "unavailable".
  if (error) {
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
