"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", text: "Poster" },
  { href: "/admin/trucks", text: "Foodtrucks" },
] as const;

// The admin screens' links, the current one marked (the owner's call, #230). None on the
// login screen, where every link would lead back to it.
export default function AdminNav() {
  const pathname = usePathname();
  if (pathname === "/admin/login") return null;

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
    </nav>
  );
}
