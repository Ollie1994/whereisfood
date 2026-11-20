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
      {/* A plain `<a>`, not `Link`: a full load, so `/map` is its own document under its
          static CSP, where a client-side navigation would keep this page's document and its
          nonce CSP (`csp.ts`). Current on no page: `/map` has no nav. */}
      <a href="/map" className="text-foreground/70 hover:underline">
        Karta
      </a>
    </nav>
  );
}
