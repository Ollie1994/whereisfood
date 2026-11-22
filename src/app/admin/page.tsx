import { cookies } from "next/headers";
import Link from "next/link";
import AdminLocations from "@/components/Admin/AdminLocations";
import { SESSION_CHECK_FAILED } from "@/lib/login";
import { createSessionClient, readOnlyCookies } from "@/lib/supabase-session";

// Who is logged in, then the entry form and the list (`AdminLocations`, Phase 7 plan, step
// 7), which read and write through the admin API routes. Behind the proxy, which lets only
// an admin through and refreshes the session first, so this read sees fresh tokens
// (`src/proxy.ts`; `readOnlyCookies` says why that matters).
export default async function AdminPage() {
  const supabase = createSessionClient(readOnlyCookies(await cookies()));
  const { data, error } = await supabase.auth.getUser();
  const email = data.user?.email;

  // The proxy has just verified this session, so any error here isn't "logged out" (plan
  // #32): say so, rather than offer the login. Not only `isTemporaryAuthError`'s errors:
  // a 401 with no code isn't one of them, and `requireAdmin` reads it as "unavailable".
  // Not a dead end if the page's read fails alone: the layout's `LogoutButton` is here too.
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
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="text-sm text-foreground/70">Inloggad som {email}.</p>
      </div>
      <AdminLocations />
    </>
  );
}
