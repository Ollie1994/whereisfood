"use client";

// The error page outside the segments that have their own (`admin/error.tsx`, `map/error.tsx`):
// an error while a page or a nested layout below the root layout renders, the admin layout
// included, which `admin/error.tsx` can't catch (Next's `error.js` convention, `error.md`,
// 16.4: a boundary wraps nested layouts, not the layout beside it). Without it, Next's
// built-in screen applied an inline style, which the `/admin` CSP blocks (PR #411's probe).
// The owner's wording, the same as `admin/error.tsx`'s (IS #413); classes only. A limit: an
// error in the root layout itself isn't caught here (`global-error.js` would be needed).
import { SMALL_BUTTON } from "@/components/Admin/styles";

export default function RootError({ retry }: { retry: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-6 scheme-light-dark">
      <h1 className="text-2xl font-semibold">Något gick fel</h1>
      <p role="alert" className="text-sm text-foreground/70">
        Sidan kunde inte visas just nu.
      </p>
      <button type="button" onClick={() => retry()} className={`self-start ${SMALL_BUTTON}`}>
        Försök igen
      </button>
    </main>
  );
}
