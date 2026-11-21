import Link from "next/link";
import { adminTitle } from "@/lib/titles";

// The `/admin` 404 (`[...missing]/page.tsx`): Swedish, styled by classes only, since the
// `/admin` CSP admits no inline `style` attribute. Its title, the owner's wording (IS #438),
// through React's `<title>`: Next documents `metadata` only for the root not-found.
export default function AdminNotFound() {
  return (
    <>
      <title>{adminTitle("Sidan finns inte")}</title>
      <h1 className="text-2xl font-semibold">Sidan finns inte</h1>
      <Link href="/admin" className="text-sm underline">
        Till admin
      </Link>
    </>
  );
}
