import type { Metadata } from "next";
import Link from "next/link";
import { ABOUT_PATH } from "@/lib/paths";

// The 404 outside `/admin` (which has its own): Swedish (CLAUDE.md, UI Rules), in the owner's
// wording (IS #413; the link's text: its comment), styled by classes only, like
// `admin/not-found.tsx`. Its title, the owner's wording (IS #438), through `metadata`, which the
// root not-found may export (Next's `not-found.md`, 16.4, "Metadata").
export const metadata: Metadata = {
  title: "Sidan finns inte | Väm",
};

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-6">
      <h1 className="text-2xl font-semibold">Sidan finns inte</h1>
      {/* SOFT-LAUNCH GATE (Phase 10 plan #5): to `/about` while `/map` is gated, as "Till
          startsidan", the owner's wording on PR #469 (IS #413's is the heading and "Till
          kartan"); back to "Till kartan" and `/map` at the full launch (the removal list in
          `src/app/map/page.tsx`). */}
      <Link href={ABOUT_PATH} className="text-sm underline">
        Till startsidan
      </Link>
    </main>
  );
}
