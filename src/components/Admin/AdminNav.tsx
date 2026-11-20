"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MFA_PATH } from "@/lib/login";

const LINKS = [
  { href: "/admin", text: "Poster" },
  { href: "/admin/trucks", text: "Foodtrucks" },
] as const;

// The admin screens' links, the current one marked (the owner's call, #230). None on the
// login screen or the TOTP step, where every link would lead back to it.
export default function AdminNav() {
  const pathname = usePathname();
  if (pathname === "/admin/login" || pathname === MFA_PATH) return null;

  return (
    <nav className="flex gap-4 text-sm">
      {LINKS.map(({ href, text }) => {
        const current = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={current ? "font-semibold underline underline-offset-4" : "text-foreground/70 hover:underline"}
          >
            {text}
          </Link>
        );
      })}
      {/* A plain `<a>`, not `Link` (Phase 10 plan, "Functions and components"): a full load, so
          `/map` is its own document under its static CSP. A `Link` to `/map`, tried once from
          `/admin/login` in headless Chrome 157 (PR #468, round 2), stayed in the admin page's
          document, under its nonce CSP, and the map drew its canvas and marker with no CSP
          violation reported. Current on no page: `/map` has no nav. */}
      <a href="/map" className="text-foreground/70 hover:underline">
        Karta
      </a>
    </nav>
  );
}
