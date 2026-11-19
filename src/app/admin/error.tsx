"use client";

// The `/admin` error page: an error thrown while a page under `/admin` renders, shown inside
// the admin layout (Next's `error.js` convention, `error.md`, 16.4). Without it, Next's
// built-in error screen applied an inline style, which the `/admin` CSP blocked ("Applying
// inline style violates … style-src 'self' 'nonce-…'"; an `aal2` admin on a page that threw,
// the owner's browser check, PR #411, round 2). Classes only, so the CSP admits it. An error
// in the admin layout itself isn't caught here (`error.md`: a segment's boundary doesn't catch
// its own layout's errors) but by the root's `error.tsx`, the same text (IS #413).
import { SMALL_BUTTON } from "@/components/Admin/styles";

export default function AdminError({ retry }: { retry: () => void }) {
  return (
    <>
      <h1 className="text-2xl font-semibold">Något gick fel</h1>
      <p role="alert" className="text-sm text-foreground/70">
        Sidan kunde inte visas just nu.
      </p>
      <button
        type="button"
        onClick={() => retry()}
        className={`self-start ${SMALL_BUTTON}`}
      >
        Försök igen
      </button>
    </>
  );
}
