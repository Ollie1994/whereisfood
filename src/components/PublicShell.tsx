import Link from "next/link";
import ExternalLink from "@/components/ExternalLink";
import VamLogo from "@/components/VamLogo";
import { CONTACT, INSTAGRAM_URL } from "@/lib/contact";
import { PRIVACY_PATH } from "@/lib/paths";

// The public pages' frame (IS #483): `/om`, `/integritet` and the root 404, not `/karta` (a
// full-screen map) or `/admin` (its own header) or `error.tsx`, which an error in the admin
// layout reaches too (`CLAUDE.md`, "Security headers"). The header's link goes to `/`, which
// leads to `/om` while the gate stands and to the map after it, so it is no gate site. Classes
// only, in `globals.css`'s public palette. Each page keeps its own `<main>` and widths.
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
      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-md flex-wrap gap-x-6 gap-y-2 px-4 py-6 text-sm text-muted md:max-w-2xl md:px-8">
          <Link href={PRIVACY_PATH} className="underline">
            Integritet och borttagning
          </Link>
          <ExternalLink href={INSTAGRAM_URL} className="underline">
            Instagram @vararmaten
          </ExternalLink>
          <a href={`mailto:${CONTACT}`} className="underline">
            {CONTACT}
          </a>
        </div>
      </footer>
    </div>
  );
}
