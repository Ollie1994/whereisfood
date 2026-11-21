import Link from "next/link";
import ExternalLink from "@/components/ExternalLink";
import VamLogo from "@/components/VamLogo";
import { CONTACT, INSTAGRAM_HANDLE, INSTAGRAM_URL } from "@/lib/contact";
import { PRIVACY_PATH } from "@/lib/paths";

// The public pages' frame (IS #483): `/om`, `/integritet` and the root 404, not `/karta` (a
// full-screen map) or `/admin` (its own header) or `error.tsx`, which an error in the admin
// layout reaches too (`CLAUDE.md`, "Security headers"). The header's link goes to `/`, which
// leads to `/om` while the gate stands and to the map after it, so it is no gate site; on `/om` it
// leads back to `/om` through that redirect, accepted (round 3 on PR #484), as is the footer's
// link to `/integritet` on `/integritet` itself. Classes only, in `globals.css`'s public palette.
// The logo sits inside that link, so the link's name is "Väm Var är maten".
// The public column, described here and written by hand in five places that must match: the
// header and footer here and each page's `<main>`, as `max-w-md px-4` on a phone and
// `md:max-w-2xl md:px-8` from `md` up.
// A limit: outside this frame `body` keeps `globals.css`'s `--background`, which a phone's
// overscroll shows past the top and bottom of the page.
export default function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-paper text-ink">
      <header className="mx-auto w-full max-w-md px-4 pt-6 md:max-w-2xl md:px-8 md:pt-10">
        <Link href="/" className="inline-flex items-center gap-3 text-lg font-semibold">
          <VamLogo size={40} />
          Var är maten
        </Link>
      </header>
      {children}
      {/* SOFT-LAUNCH GATE (Phase 10 plan #5): at the full launch, when `/` leads to the map, the
          footer gains a link to `/om`, which nothing else links to then (the owner's call, round 3
          on PR #484; the removal list in `src/app/karta/page.tsx`). */}
      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-md flex-wrap gap-x-6 gap-y-2 px-4 py-6 text-sm text-muted md:max-w-2xl md:px-8">
          <Link href={PRIVACY_PATH} className="underline">
            Integritet och borttagning
          </Link>
          <ExternalLink href={INSTAGRAM_URL} className="underline">
            Instagram {INSTAGRAM_HANDLE}
          </ExternalLink>
          <a href={`mailto:${CONTACT}`} className="underline">
            {CONTACT}
          </a>
        </div>
      </footer>
    </div>
  );
}
