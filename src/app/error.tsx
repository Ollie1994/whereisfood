"use client";

// The error page outside the segments that have their own (`admin/error.tsx`, `map/error.tsx`):
// an error while a page or a nested layout below the root layout renders, the admin layout
// included, which `admin/error.tsx` can't catch (Next's `error.js` convention, `error.md`,
// 16.4: a boundary wraps nested layouts, not the layout beside it). Without it, a throw in the
// admin layout showed Next's built-in screen, whose inline style the `/admin` CSP blocked, and
// with it this page, on a full load of `/admin/login` (the owner's browser checks, builds A
// and B on IS #413's PR). Limits: it replaces the admin layout, so an admin there gets no nav
// and no "Logga ut"; and an error in the root layout itself isn't caught here
// (`global-error.js` would be needed).
import ErrorNotice from "@/components/ErrorNotice";

export default function RootError({ retry }: { retry: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-6">
      <ErrorNotice retry={retry} />
    </main>
  );
}
