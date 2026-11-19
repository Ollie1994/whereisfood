import type { Metadata } from "next";
import Link from "next/link";

// The 404 outside `/admin` (which has its own): Swedish (CLAUDE.md, UI Rules), in the owner's
// wording (IS #413), styled by classes only, like `admin/not-found.tsx`. Its title, the
// owner's wording (IS #438), through `metadata`, which the root not-found may export (Next's
// `not-found.md`, 16.4, "Metadata").
export const metadata: Metadata = {
  title: "Sidan finns inte | Var är maten?",
};

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-6">
      <h1 className="text-2xl font-semibold">Sidan finns inte</h1>
      <Link href="/map" className="text-sm underline">
        Till kartan
      </Link>
    </main>
  );
}
