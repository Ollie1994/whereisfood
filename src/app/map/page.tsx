import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import MapClient from "@/components/Map/MapClient";
import { ABOUT_PATH } from "@/lib/paths";
import { requireAdmin } from "@/lib/services/admin-auth";
import { createSessionClient, readOnlyCookies } from "@/lib/supabase-session";

// SOFT-LAUNCH GATE (Phase 10 plan #5). Until the full launch (Phase 11), `/map` shows only to
// the admin at `aal2`; everyone else is sent to `/about`. The check is `withAdmin`'s
// (`src/lib/http/admin.ts`): `requireAdmin` with `readOnlyCookies`, here with no proxy before
// it to refresh the session, which IS #448's probe showed the session survives (plan #6,
// Plan A; `readOnlyCookies`' comment). `redirect()` throws to answer, so nothing here catches.
//
// The gate hides `/map`; it protects nothing. `/map` renders only what `/api/live` already
// publishes, so `<MapClient />` takes no props (the no-props test), and nothing admin-only goes
// behind the gate while it stands (`CLAUDE.md`, "The soft-launch gate").
//
// THE REMOVAL LIST, its one copy (plan #5). Every gate site carries the marker above and is
// listed here; `gate-markers.test.ts` checks the list against `git grep`. At the full launch
// each site goes back as it says, then: `git grep` finds no marker outside `.claude/`, the
// build's route table shows `○ /map`, smoke passes, `/api/live`'s cache headers are unchanged,
// and `/map` is checked in a browser (`CLAUDE.md`, "Testing").
// - src/app/map/page.tsx: `MapPage` back to `return <MapClient />`, with `MapClient`'s import
//   alone and no header.
// - src/app/map/page.test.tsx: deleted (the gate's unit tests and the no-props test).
// - src/app/map/gate-markers.test.ts: deleted (the marker test).
// - tests/integration/map-gate.test.ts: deleted (the gate on the local stack).
// - src/app/page.tsx: `Home` redirects to `/map` again.
// - scripts/smoke.mjs: `/` expects the redirect to `/map`, and `/map` 200, html, the static CSP.
// - scripts/smoke.test.mjs: its `/` and `/map` cases to match.
// - src/app/about/page.tsx: the sentence that the map opens when the trucks are back,
//   rewritten for after the launch.
// - src/app/not-found.tsx: the link back to "Till kartan" and `/map`.
// - src/lib/supabase-session.ts: `readOnlyCookies`' marked sentence deleted, so the comment says
//   to use it behind the proxy alone.
// - README.md: "It redirects to `/map`" ("4. Run") and "the app's `/` only redirects to
//   `/map`" ("Hosted preview database"), and their HTML-comment markers removed.
// - CLAUDE.md: "The soft-launch gate" deleted.
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
