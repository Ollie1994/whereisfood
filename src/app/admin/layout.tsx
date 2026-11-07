import type { Metadata } from "next";
import LogoutButton from "@/components/Admin/LogoutButton";

// WhereIsFood is the temporary name until Phase 8 picks one (Phase 7 plan, #26).
export const metadata: Metadata = {
  title: "WhereIsFood – admin",
};

// Logout on every admin screen, the login included, so a non-admin or an expired
// session can clear its cookies too (plan step 2).
export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-6">
      <header className="flex items-center justify-between gap-4">
        <span className="text-lg font-semibold">WhereIsFood</span>
        <LogoutButton />
      </header>
      <main className="flex flex-col gap-6">{children}</main>
    </div>
  );
}
