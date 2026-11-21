import type { Metadata } from "next";
import { connection } from "next/server";
import AdminNav from "@/components/Admin/AdminNav";
import LogoutButton from "@/components/Admin/LogoutButton";
import { ADMIN_TITLE } from "@/lib/titles";

// Väm, the app's name (Phase 10 plan, open decision 1, IS #452).
export const metadata: Metadata = {
  // `absolute`, so the root layout's public template doesn't add itself (`src/lib/titles.ts`).
  title: { absolute: ADMIN_TITLE },
};

// Logout on every admin screen, the login included, so a non-admin or an expired
// session can clear its cookies too (plan step 2).
//
// `scheme-light-dark` tells the browser the page follows the system's dark mode, as
// `globals.css`'s colours do, so it draws the date and time pickers' icons light on dark;
// without it they were dark on the dark page (the owner's browser check).
// Here, not in `globals.css`, so the public map is unchanged.
//
// `connection()` renders every page under `/admin` per request, so Next can put the proxy's
// nonce on its scripts; a page built at build time would carry none, and the nonce CSP would
// block them all (Next's CSP guide, "Forcing dynamic rendering"; Phase 9 plan step 9).
export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await connection();
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-6 scheme-light-dark">
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <span className="text-lg font-semibold">Väm</span>
          <LogoutButton />
        </div>
        <AdminNav />
      </header>
      <main className="flex flex-col gap-6">{children}</main>
    </div>
  );
}
