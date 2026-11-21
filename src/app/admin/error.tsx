"use client";

// The `/admin` error page: an error thrown while a page under `/admin` renders, shown inside
// the admin layout (Next's `error.js` convention, `error.md`, 16.4). Without it, Next's
// built-in error screen applied an inline style, which the `/admin` CSP blocked ("Applying
// inline style violates … style-src 'self' 'nonce-…'"; an `aal2` admin on a page that threw,
// the owner's browser check, PR #411, round 2). Classes only, so the CSP admits it. An error
// in the admin layout itself isn't caught here (`error.md`: a segment's boundary doesn't catch
// its own layout's errors) but by the root's `error.tsx`, with the same `ErrorNotice` (IS #413).
import ErrorNotice from "@/components/ErrorNotice";

export default function AdminError({ retry }: { retry: () => void }) {
  return <ErrorNotice title="Något gick fel – Väm admin" retry={retry} />;
}
