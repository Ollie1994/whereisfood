"use client";

// The root error page. Its main case is an error in the admin layout, which `admin/error.tsx`
// can't catch (Next's `error.js` convention, `error.md`, 16.4: a boundary wraps nested
// layouts, not the layout beside it); the other pages it covers today are `/`, which only
// redirects, `/om` and `/integritet`, which are static, and the root `not-found.tsx`, which
// an `error.js` wraps (Next's `project-structure.md`, 16.4, "Component hierarchy"); `/karta` has
// its own.
// Without it, a throw in the admin layout showed Next's built-in screen, whose inline style
// the `/admin` CSP blocked, and with it this page, on a full load of `/admin/login` (the
// owner's browser checks, builds A and B on IS #413's PR); a client-side navigation into
// `/admin` wasn't checked. It keeps `scheme-light-dark`, as the admin layout it replaces does.
// Limits: an admin here gets no nav and no "Logga ut"; its title is this page's public one
// (`pageTitle`) or the admin layout's: on a full load of `/admin/login` with the admin layout
// throwing, the server's HTML (a 500) held only `<title>Admin | Väm</title>` (`npm start`, PR
// #477), and what the tab shows once this page renders wasn't checked. An error in the root
// layout itself, or while this page renders, isn't caught here (`global-error.js` would be
// needed).
import ErrorNotice from "@/components/ErrorNotice";
import { pageTitle } from "@/lib/titles";

export default function RootError({ retry }: { retry: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-6 scheme-light-dark">
      <ErrorNotice title={pageTitle("Något gick fel")} retry={retry} />
    </main>
  );
}
