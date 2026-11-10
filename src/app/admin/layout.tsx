import type { Metadata } from "next";
import AdminNav from "@/components/Admin/AdminNav";
import LogoutButton from "@/components/Admin/LogoutButton";

// WhereIsFood is the temporary name until Phase 8 picks one (Phase 7 plan, #26).
export const metadata: Metadata = {
  title: "WhereIsFood – admin",
};

// Logout on every admin screen, the login included, so a non-admin or an expired
// session can clear its cookies too (plan step 2).
//
// `scheme-light-dark` tells the browser the page follows the system's dark mode, as
// `globals.css`'s colours do, so it draws the date and time pickers' icons light on dark;
// without it they were dark on the dark page (the owner's browser check).
// Here, not in `globals.css`, so the public map is unchanged.
export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-6 scheme-light-dark">
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <span className="text-lg font-semibold">WhereIsFood</span>
          <LogoutButton />
        </div>
        <AdminNav />
      </header>
      <main className="flex flex-col gap-6">{children}</main>
    </div>
  );
}
