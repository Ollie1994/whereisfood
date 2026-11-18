import { notFound } from "next/navigation";

// Every `/admin/…` path no page matches, so its 404 renders here, under the admin layout
// and per request with the proxy's nonce (`connection()` there), not as the root
// `_not-found` built at build time. That one carried no nonce on its 14 scripts and had
// inline `style` attributes, which the `/admin` CSP blocked (an `aal2` admin's
// `/admin/finnsinte` under `next start`, PR #411, round 1). Next sends an unmatched URL to
// the root not-found (`not-found.md`, "Good to know"), so a page here is what keeps it
// under `/admin`. The proxy runs first, so without an admin session this is the login.
export default function MissingAdminPage() {
  notFound();
}
