"use client";

// The `/admin` error page: an error thrown while a page under `/admin` renders, shown inside
// the admin layout (Next's `error.js` convention, `error.md`, 16.4). Without it, Next's
// built-in error screen applied an inline style, which the `/admin` CSP blocked ("Applying
// inline style violates … style-src 'self' 'nonce-…'"; an `aal2` admin on a page that threw,
// the owner's browser check, PR #411, round 2). Classes only, so the CSP admits it. A limit:
// an error in the admin layout itself isn't caught here, but by the root's built-in screen.
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
        className="self-start rounded-md border border-foreground/30 px-3 py-1 text-sm font-medium"
      >
        Försök igen
      </button>
    </>
  );
}
