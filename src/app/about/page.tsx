import type { Metadata } from "next";
import Link from "next/link";
import { PRIVACY_PATH } from "@/lib/paths";

// What the app is (Phase 10 plan, step 3): where everyone but the admin lands during the soft
// launch, and a page that stays after it, linking the privacy note (step 9). Static, Swedish
// (CLAUDE.md, UI Rules), in the root `not-found.tsx`'s column (`max-w-md`, `px-4 py-6`) and
// heading style.
export const metadata: Metadata = {
  title: "Om tjänsten | Var är maten?",
};

export default function AboutPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-semibold">Var är maten?</h1>
      <p>
        En karta över var Göteborgs foodtruckar står i dag. Varje plats läggs in för hand, så
        kartan visar bara de foodtruckar som har en plats inlagd för dagen.
      </p>
      {/* SOFT-LAUNCH GATE (Phase 10 plan #5): rewritten at the full launch, when the map opens
          (the removal list in `src/app/map/page.tsx`). */}
      <p>Kartan öppnar när foodtruckarna är tillbaka för säsongen.</p>
      <Link href={PRIVACY_PATH} className="text-sm underline">
        Integritet och borttagning
      </Link>
    </main>
  );
}
