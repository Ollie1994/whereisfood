import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import MapClient from "@/components/Map/MapClient";
import { ABOUT_PATH } from "@/lib/paths";
import { requireAdmin } from "@/lib/services/admin-auth";
import { createSessionClient, readOnlyCookies } from "@/lib/supabase-session";

// SOFT-LAUNCH GATE (Phase 10 plan #5). Until the full launch (Phase 11), `/karta` shows only to
// the admin at `aal2`; everyone else is sent to `/om`. The check is `withAdmin`'s
// (`src/lib/http/admin.ts`): `requireAdmin` with `readOnlyCookies`, here with no proxy before
// it to refresh the session, which IS #448's probe showed the session survives (plan #6,
// Plan A; `readOnlyCookies`' comment). `map-gate.test.ts` checks it on the local stack with a
// cookie past its `expires_at` whose JWT is still valid; a truly expired JWT rests on IS #448.
// `redirect()` throws to answer, so nothing here catches.
//
// Limits, beside `requireAdmin`'s (`admin-auth.ts`):
// - A session it refuses and signs out (past the time-box, or a first factor it doesn't admit)
//   keeps its cookies, which `readOnlyCookies` can't delete, until something clears them, as
//   `admin-auth.ts`'s time-box limit says; so each `/karta` load till then asks Auth again
//   (`requireAdmin`'s `getUser`) before redirecting.
// - `createSessionClient` throws on a missing Supabase URL or anon key, or a bad URL
//   (`supabase-url.ts`), before any check, so `/karta` then answers its error page, not the
//   redirect; the rest of the app needs them too.
// - `/karta` is a function run per request now, not a static page. A request with a cookie named
//   like a session (`hasSessionCookie`) gets past the cookie check and costs Auth calls
//   (`getSession`, which refreshes a cookie past its `expires_at`, then `getUser`), as it does
//   on any `/admin` path through the proxy; one with no such cookie costs only the run.
//
// The gate hides `/karta`; it protects nothing. `/karta` renders only what `/api/live` already
// publishes, so `<MapClient />` takes no props (the no-props test), and nothing admin-only goes
// behind the gate while it stands (`CLAUDE.md`, "The soft-launch gate").
//
// THE REMOVAL LIST, its one copy (plan #5). Every gate site carries the marker above and is
// listed here; `gate-markers.test.ts` checks the list against `git grep`. At the full launch
// each site changes as it says, then: `git grep` finds no marker outside `.claude/`, the
// build's route table shows `○ /karta`, smoke passes, `/api/live`'s cache headers are unchanged,
// and `/karta` is checked in a browser (`CLAUDE.md`, "Testing").
// - src/app/karta/page.tsx: `MapPage` back to `return <MapClient />`, with its `metadata` (the
//   "Karta" title) and the imports `MapClient` and it need, and no header.
// - src/app/karta/page.test.tsx: deleted (the gate's unit tests and the no-props test).
// - src/app/karta/gate-markers.test.ts: deleted (the marker test).
// - tests/integration/map-gate.test.ts: deleted (the gate on the local stack).
// - src/app/page.tsx: `Home` redirects to `/karta`, its `ABOUT_PATH` import gone.
// - scripts/smoke.mjs: `/` expects the redirect to `/karta`, and `/karta` 200, html, the static
//   CSP.
// - scripts/smoke.test.mjs: its `/` and `/karta` cases to match.
// - src/app/om/page.tsx: the intro's "Snart kan du öppna kartan, … gå och äta" back to "Öppna
//   kartan, … gå och ät"; the "Just nu" card (why the map isn't open) deleted; and "Vägen
//   framåt" rewritten for after the launch, its "Nu" no longer the soft launch (IS #483).
// - src/app/not-found.tsx: the link to "Till kartan", its text before the gate, and `/karta`, its
//   `ABOUT_PATH` import gone, and its header's pointer to the link's comment.
// - src/components/PublicShell.tsx: the footer gains a link to `/om` (its text the owner's call
//   then), since nothing else links to `/om` once `/` leads to the map (IS #483).
// - src/app/integritet/page.tsx: the link to "Till kartan" and `/karta`, its `ABOUT_PATH` import
//   gone.
// - src/lib/supabase-session.ts: `readOnlyCookies`' marked sentence deleted, so the comment says
//   to use it behind the proxy alone.
// - README.md: "It redirects to `/karta`" ("4. Run") and "the app's `/` only redirects to
//   `/karta`" ("Hosted preview database"), and their HTML-comment markers removed; and in "Get
//   the map tiles", the `whereisfood-where-is-food.vercel.app` alias's no-origin call (IS #506)
//   taken back to the owner by the full launch's issue, since `/karta` then shows the map to
//   anyone who reaches it: the alias gets R2's CORS origin, or the paragraph keeps none with
//   the owner's new reasons; its marker removed either way.
// - CLAUDE.md: "The soft-launch gate" deleted.
// - RUNBOOK.md: in "Telling a new truck", both texts that tell a new truck it's listed (Phase
//   10 plan, open decision 13; IS #511) lose "Kartan är inte öppen för alla ännu, den öppnar när
//   fler foodtruckar är med.", the owner approving the new texts; its HTML-comment marker
//   removed.
export const metadata: Metadata = { title: "Karta" };

export default async function MapPage() {
  const store = await cookies();
  const supabase = createSessionClient(readOnlyCookies(store));
  const check = await requireAdmin({
    cookieNames: store.getAll().map(({ name }) => name),
    auth: supabase.auth,
    now: new Date(),
  });
  if (!check.ok) redirect(ABOUT_PATH);
  return <MapClient />;
}
