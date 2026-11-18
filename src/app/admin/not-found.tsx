import Link from "next/link";

// The `/admin` 404 (`[...missing]/page.tsx`): Swedish, styled by classes only, since the
// `/admin` CSP admits no inline `style` attribute.
export default function AdminNotFound() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Sidan finns inte</h1>
      <Link href="/admin" className="text-sm underline">
        Till admin
      </Link>
    </>
  );
}
