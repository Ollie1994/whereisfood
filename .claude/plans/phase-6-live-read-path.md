# Phase 6 — Live read path

**Planned:** 2026-10-25 · **Status:** agreed when this plan's PR (step 0) merges; in
progress from that merge.

**Source:** `project-context.md` Part 2 ("Phase map", "Read path: `GET /api/live`
(Phase 6)", "Pricing and upgrade triggers"), Part 1 ("Database": the hosted checks),
its "Decisions carried forward" table (the six rows marked **between phases**, taken up
by #1–#6), and the `/create-milestone` conversation of 2026-10-25. Where this plan and
`project-context.md` disagree, **this plan wins** until step 10 reconciles the context.

**Purpose of the phase:** the map stops showing fake data. A visitor's map reads today's
entries from the database through one CDN-cached route, and the first preview deploy
proves the read path, the cache and the launch tile setup on real infrastructure before
Phase 7 builds the admin screen that writes to it.

---

## Goal

On a Vercel preview deploy, `/map` shows the trucks with an entry today, from a hosted
Supabase project through a CDN-cached `GET /api/live`, with polling, marker diffing and
a popup with "Uppdaterad HH:MM" and the Instagram link, and with the fake data and the
old confidence design gone.

---

## Prerequisites

- Node `^20.19.0 || >=22.12.0` and npm ≥ 11 (`CLAUDE.md`, "Dependencies").
- Docker running, for local Supabase and `npm run test:all`.
- `public/gothenburg.pmtiles` cut locally (README, "Get the map tiles"): step 4 uploads
  it.
- **Steps 4–6 create the project's first hosted accounts:** Cloudflare (R2), a
  Supabase org for previews, Vercel. Each gets two-factor authentication by passkey,
  hardware key or authenticator app, not SMS, when it is created (#3). The owner
  creates the accounts; their keys never enter a tracked file or issue/PR text
  (`CLAUDE.md`, "Secrets").

---

## Out of Scope

| Item | Where it goes |
|---|---|
| Admin login, `proxy.ts`'s real matcher and checks, the admin screen and its routes, write services, the `23P01` → 409 mapping, the morning checklist, truck CRUD | Phase 7 |
| Splitting `src/lib/supabase.ts` into server-only and browser modules (`/api/live` imports it server-side only; the first client import is Phase 7's login screen) | Phase 7 |
| Production deploy, Supabase Pro, security headers, the Swedish privacy note, the takedown procedure, Vercel Pro and Spend Management | Phase 8 |
| A custom domain for the tiles, if step 4 uses `r2.dev` (open decision 1) | Phase 8 |
| CI/CD, SAST, branch protection, the pre-commit and CI secret scan, Dependabot security updates (#1); the gates stay manual (#2) | Phase 8 |
| Rotating credentials (#4) | Phase 8, before the production deploy |
| ISR, a save-triggered cache purge, Realtime, cron, a `CDN-Cache-Control` header, a firewall or rate-limit rule (unless junk traffic appears) | not planned (`project-context.md`, "Read path") |
| A new migration, unless a hosted check forces one (#19) | — |
| Product decisions #1 (retention), #2 (checklist look-back), #3 (default times), #4 (app name; unless UI text needs it) | Phases 7–8 |
| "…av admin" / "…av [truck]" in the popup (the `source` column) | Owners phase |

---

## Files

### Create

| File | What |
|---|---|
| `src/lib/live.ts` | The response contract (`LiveEntry`, `LiveResponse`, `MarkerEntry`) and pure helpers: `isLiveResponse`, `isLiveEntry`, `todaysEntries`, `markerFor`, `diffMarkers`, `hoursText`, `freshnessText`, `statusText`. No clock reads, no React, no env |
| `src/lib/live.test.ts` | Unit tests for those helpers |
| `src/lib/services/live.ts` | `getLiveMap`, the first service: reads the clock, both db reads, the `is_active` filter, the response built field by field, entries failing `isLiveEntry` dropped (#20) |
| `src/app/api/live/route.ts` | `GET`: `withErrorHandling`, the `Cache-Control` header, calls the service. HTTP only |
| `tests/integration/api-live.test.ts` | `GET` against local Supabase: header, key set, filters, error → 500 |
| `src/hooks/useLocations.ts` | Fetch on load, poll every 60 s while visible, refetch on `visibilitychange`, the 30 s tick; returns one `MarkerEntry` per truck and `now` |

The error case (a throwing service → 500, never `[]`) may instead live in a co-located
unit test of the route (`src/app/api/live/route.test.ts`) if mocking the service is
cleaner there than in the integration file; step 2's PR says which.

### Modify

| File | What |
|---|---|
| `src/hooks/useMapLibre.tsx` | Drops fake data, confidence colours, grey markers and `last_known_*`. Keeps map init; takes `markers` and `now`, and applies `diffMarkers` to the live `maplibregl.Marker`s |
| `src/components/Map/MapClient.tsx` | `const { markers, now, fetchState } = useLocations(); useMapLibre(containerRef, markers, now)`; renders the empty state and stale notice from `fetchState` and `markers` (open decisions 6, 7) |
| `src/components/Map/TruckPopup.tsx` | New props (`marker`, `now`, `onClose`); label, status, hours, freshness text, Instagram link; the confidence labels go |
| `.env.example` | `NEXT_PUBLIC_PMTILES_URL`'s comment: R2 for deploys, the local file in dev |
| `README.md` | Tiles on R2 (bucket, access, CORS, upload); the hosted Supabase and Vercel preview setup; status line, "What works today", "Project status"; step 7: "Prerequisites" points at `package.json` (#139) |
| `CLAUDE.md` | Step 0: the bold "Current phase plan" line. Step 3: the UI Rules' "(Phase 6)" paragraph stops describing the fake-data map. Step 4: the Tech Stack's tile line. Step 7: "Dependencies" points at `package.json` for the Node and npm minimums (#139). Step 10: the bold line back to none, and the rules the reconciliation carries |
| `src/lib/db/complete.ts` | Step 5: its comment's "checking it is Phase 6's" becomes the hosted result |
| `package.json` | Step 7 (#139): `devEngines` / `engines` |
| `.claude/process-log.md`, `.claude/context/project-context.md` | The closing steps |

### Delete

- `src/lib/fake-data.ts`
- `src/lib/map-types.ts` (Phase 5 plan decision #1: frozen until Phase 6 deletes it)

### Untouched, on purpose

- `supabase/migrations/` (#19), `src/lib/db/trucks.ts`, `src/lib/db/locations.ts`
  (#9: the filter lives in the service)
- `src/lib/supabase.ts` (Phase 7), `src/proxy.ts` (its matcher doesn't match
  `/api/live`)

### Outside the repo (steps, not files)

- The R2 bucket, its public access and CORS rule (step 4)
- The hosted Supabase project and its data (step 5)
- The Vercel project and its preview-scoped environment variables (step 6)

### Functions and types

**`src/lib/live.ts`** (shared by service, route, hook and popup; pure)
- `type LiveEntry = { id, truck: { id, name, instagram_handle, cuisine_type }, latitude,
  longitude, label, starts_at, ends_at, updated_at }`. Field types come from
  `Location` and `Truck` (`src/lib/types.ts`) by `Pick`, so a schema change reaches
  them.
- `type LiveResponse = { entries: LiveEntry[] }` (#11).
- `type MarkerEntry = { entry: LiveEntry, status: "open" | "later" }`.
- `isLiveResponse(body): body is LiveResponse`: the guard the hook applies to a 2xx
  body before using it. It checks every field of every entry that `LiveEntry`
  declares, not only that `entries` is an array: string `id`, `truck.id` and
  `truck.name`; `truck.instagram_handle`, `truck.cuisine_type` and `label` each a
  string or null; numeric `latitude` within ±90 and `longitude` within ±180 (MapLibre's
  `LngLat` throws outside ±90 latitude, and the schema has no range CHECK; added in
  PR #190's round 1); `starts_at`, `ends_at` and
  `updated_at` ISO 8601 timestamps with an offset (PostgREST returns
  `…T09:00:00+00:00`, `src/lib/db/locations.ts`): a date, a time with optional
  fractional seconds (`updated_at` comes from `now()` and the trigger, with
  microseconds: `…T05:12:07.123456+00:00`) and an offset, by pattern, and valid by
  `date-fns`'s `parseISO` and `isValid`. Not `Date.parse`, which
  accepts `"1"`, nor `parseISO` alone, which accepts `"2026"` (both probed 2026-10-25)
  or an offset of `+24:00` (PR #190's round 1) or an hour of 24 (round 2), so the
  pattern bounds the time's and the offset's hours. One bad entry fails the whole body; the service drops such rows first (#20).
- `isLiveEntry(value): value is LiveEntry`: the per-entry check `isLiveResponse`
  applies, exported for the service (#20).
- `todaysEntries(entries, now)`: entries with `ends_at > now` and `starts_at` before
  the next Stockholm midnight after `now`.
- `markerFor(entries, now): Map<truckId, MarkerEntry>`: one per truck (#12) among
  today's entries, the entry open at `now`, else the earliest later one. It applies
  `todaysEntries` itself, so a caller passing the raw response can't show tomorrow's
  entry (PR #190's round 1).
- `diffMarkers(prev, next): { add, update, remove }`, keyed by truck id. An update is a
  change of entry id, position, status, or any field the popup shows.
- `hoursText(entry, now)` → `"11:00–14:00"`, naming a day that isn't today (#21):
  `"igår 20:00–12:00"`, `"23:00–02:00 imorgon"`; `statusText(marker)` → `"Öppet nu"` /
  `"Öppnar 17:00"`; `freshnessText(updated_at, now)` → the forms open decision 5
  settled (`"Uppdaterad 08:12"`, `"Uppdaterad igår 18:30"`, …). All in
  `Europe/Stockholm` via `date-fns-tz`.

**`src/lib/services/live.ts`**
- `getLiveMap(now = new Date()): Promise<LiveResponse>`: the only clock read on the
  server. Its window is `[now, now + 26 h)`: the client keeps entries starting before
  the next Stockholm midnight, which can be up to 25 h away on the fall-back day, and a
  response can be about 3 min old when the client last uses it (up to 120 s in the CDN,
  `s-maxage=60` plus `stale-while-revalidate=60`, then up to 60 s until the next poll),
  so 26 h is a superset while polls succeed. While they fail, the client keeps older
  data (#16) and `fetchState` says so. The client's
  `todaysEntries` does the Stockholm cut; the service needs no time zone. Runs
  `listActiveTrucks()` and `findLocationsOverlapping(now, now + 26 h)` in parallel, drops rows whose `truck_id` isn't an active truck (#9), and builds each
  entry field by field, never by spreading a row (#11). Drops each built entry that
  fails `isLiveEntry`, logging its location id with `console.warn` (#20). Errors
  propagate.

**`src/app/api/live/route.ts`**
- `GET()`: `withErrorHandling(async () => NextResponse.json(await getLiveMap(), {
  headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=60" } }))`.
  Doesn't read the request; exports nothing but `GET` (#17).

**`src/hooks/useLocations.ts`**
- `useLocations(): { markers: Map<truckId, MarkerEntry>, now: Date, fetchState:
  "loading" | "ok" | "failing" }`: fetch on mount; every 60 s while visible; at once on
  `visibilitychange` → visible; paused while hidden. An `AbortController` per request:
  starting a fetch aborts the one in flight, and unmount aborts the last, so only the
  newest request can apply its result. **An aborted request is neither a result nor a
  failure:** its `AbortError` changes nothing. `fetchState` is `loading` before any
  request has finished, `failing` after a failed fetch (the first one included) until
  the next good one, and `ok` after a good one. Open decisions 6 and 7 render from it:
  the empty state only when `ok` with no markers, never while `loading` or `failing`. **A failed fetch is a rejected `fetch`, a non-2xx
  status (the route's 500 `{ error }` included), a body `res.json()` can't parse, or
  one `isLiveResponse` rejects**, and it
  keeps the last good entries (#16): it never replaces them with an empty list. A 30 s
  tick (and becoming visible) sets `now` and re-derives `markerFor(entries, now)` (which
  applies `todaysEntries`); `now` is returned for the popup (#15).

**`src/hooks/useMapLibre.tsx`**
- `useMapLibre(containerRef, markers, now)`:
  - **Refs:** the live markers (each truck's `maplibregl.Marker` **and its current
    `MarkerEntry`**), the current `now`, and **the open popup** (`{ truckId, popup,
    root }`, or none). The open popup's `close` handler clears that ref before it
    unmounts the root, however the popup closed (a map click, a marker removal, the
    cleanup), so "open" always means the ref is set.
  - **`renderOpenPopup({ sync })`:** if a popup is open, renders `TruckPopup` into its
    root from its truck's current entry and the current `now`, and calls
    `popup.setLngLat` with the entry's position. The only place popup content is
    rendered. The click handler passes `sync: true`, rendering inside `flushSync` (as
    today) so the popup measures filled content before `addTo`; the effects use a plain
    `root.render`, because `flushSync` inside an effect logs "flushSync was called from
    inside a lifecycle method" (React 19's `flushPassiveEffects` sets `CommitContext`,
    `react-dom-client.development.js`).
  - **Init effect:** builds the map as today and exposes it to the other effects (e.g.
    as state it sets). Its cleanup closes the open popup and calls `remove()` on every
    live marker, as today's does, then **empties the live-marker ref** and removes the
    map. (`map.remove()` alone would also close the popup: `Popup.addTo` registers
    `map.on("remove", this.remove)` and `Popup.remove` fires `close`;
    `maplibre-gl-dev.mjs` 6.11.2.) The explicit close keeps the open-popup ref cleared
    before the map goes. So a rebuilt map (React StrictMode's mount → cleanup → mount
    in dev, or any re-init) diffs from empty and gets every marker.
  - **Marker effect** (on the map and `markers`): applies `diffMarkers(liveMarkers,
    markers)` to the ref. Add creates a marker; update stores the new entry, calls
    `setLngLat` and restyles the element; remove calls `remove()` and closes the popup
    if it is that truck's. Then, if the open popup's truck was updated, it calls
    `renderOpenPopup()`, so the popup moves and re-renders in the same pass, with no
    dependence on effect order.
  - **Click handler:** calls `event.stopPropagation()` first (as today, so the map's
    `closeOnClick` doesn't close the popup it opens), closes any open popup, creates
    one for its truck with a content element and its React root, registers its `close`
    handler (clear the open-popup ref, then `queueMicrotask(() => root.unmount())`, as
    today defers it), sets the open-popup ref, calls `renderOpenPopup({ sync: true })`,
    then `setDOMContent(content)` and adds the popup to the map. It reads the entry and `now` from the refs, never
    values captured at add.
  - **`now` effect:** stores `now` in its ref and calls `renderOpenPopup()`, so the
    open popup's freshness, status and hours text (#21) follow the tick (e.g. across Stockholm
    midnight). `diffMarkers` doesn't take `now`.
- `createMarkerElement(status)`: open filled, later outlined (open decision 8).

**Components**
- `TruckPopup({ marker, now, onClose })`: name, cuisine, label (the line is left out
  when `label` is NULL, #13), status, hours, freshness text, Instagram link. Renders
  only; its text comes from `live.ts`, and it keeps no `TZ` or time formatting of its
  own (today's has both; PR #190's round 2).
- `MapClient`: wires the two hooks, and renders the empty state and the stale notice
  (as open decisions 6 and 7 settle them) from `fetchState` and `markers`.

---

## Steps

Strict order, with one exception: step 4 depends only on step 0 and may run alongside
steps 1 and 2; it must precede step 6, which needs the tiles. Its PR isn't open at the
same time as step 3's or step 5's, because their ride-alongs edit `README.md` too (and
step 3's `CLAUDE.md`). Steps 0–8 and 10 are one issue and
one PR into `dev` each; step 9 is one issue and PR per follow-up the retrospective
opens, which may be none. Step 7 is the existing issue #139.

0. **This plan.** The plan file, and `CLAUDE.md`'s bold "Current phase plan" line
   naming it, where between phases it read `none (the last one:
   .claude/plans/phase-5-schema-reset.md)`. Only that line of the header changes.
1. **The response contract and pure helpers.** `src/lib/live.ts` (the types, `isLiveResponse`,
   `todaysEntries`, `markerFor`, `diffMarkers`, `hoursText`, `statusText`, `freshnessText`) and
   `src/lib/live.test.ts`. *First because* the server and the client both build on the
   contract, and this needs no Docker, env or account.
2. **The server.** `src/lib/services/live.ts` (`getLiveMap`),
   `src/app/api/live/route.ts` (`GET`), `tests/integration/api-live.test.ts`. Record
   in the PR `next build`'s line for `/api/live`. *Before the client, so* the client is
   written against a tested endpoint. A separate issue from step 1: it is the first
   service and the first route, and gets its own review.
3. **The client.** `src/hooks/useLocations.ts`; `src/hooks/useMapLibre.tsx`
   (`useMapLibre(containerRef, markers, now)`, `createMarkerElement`);
   `src/components/Map/TruckPopup.tsx`; `src/components/Map/MapClient.tsx`; delete
   `src/lib/fake-data.ts` and `src/lib/map-types.ts`. Settle open decisions 6–8 (5 was
   settled in step 1, #182). A
   browser check of `/map` in `npm run dev` (StrictMode on) against local Supabase,
   **right after `npx supabase db reset`**: the seed's live row spans only `[reset − 1 h,
   reset + 12 h)` (`supabase/seed.sql`), so a check run later sees an empty map. Docs
   this makes stale ride along: `CLAUDE.md`'s UI Rules "(Phase 6)"
   paragraph, `README.md`'s status line and "What works today". *The fake data can
   only go once the real path works; everything up to here is local, so no hosted
   account exists before the code is proven.*
4. **Tiles on R2** (#7). Create the Cloudflare account (#3); a bucket (Standard
   storage); public access (open decision 1); the CORS rule (allowed origins per open
   decision 10; methods `GET`, `HEAD`; headers `range`, `if-match`; exposed `etag`);
   upload `gothenburg.pmtiles`. Check `/map` locally with
   `NEXT_PUBLIC_PMTILES_URL` pointing at R2. Ride along: `README.md` (tiles on R2),
   `.env.example`, `CLAUDE.md`'s Tech Stack tile line. *Before the deploy, which has no
   tiles otherwise* (`public/*.pmtiles` is gitignored). When it may run: the Steps
   intro's exception.
5. **Hosted Supabase (preview)** (#18). A project in a separate free org (#3); region
   per open decision 4; key type per open decision 3; `npx supabase db push` the
   baseline. Run the three hosted checks (`project-context.md` Part 1, "Database"):
   `sv-SE-x-icu`, both extensions in `extensions` with the trigger form accepted, and
   the Data API's `max_rows` ≥ `MAX_ROWS`. Probe that anon is refused SELECT on `trucks`
   and `locations` through the hosted REST API (`42501`, as `rls.test.ts` asserts
   locally). Load data (open decision 2). Ride along:
   `src/lib/db/complete.ts`'s comment, `README.md`'s setup. **A failed check stops the
   plan here:** the fix (a migration, #19, or a setting) gets a decision first.
   *Before Vercel, which needs this project's URL and keys.*
6. **Vercel project and the first preview deploy.** Create the account (#3); import
   the repo; preview-scoped environment variables (#5): all four of `.env.example`'s,
   or the names open decision 3 leads to. `NEXT_PUBLIC_PMTILES_URL` (the R2 URL) is
   inlined at build time and `useMapLibre` draws nothing without it;
   `src/lib/supabase.ts` throws at import without the anon key, though nothing uses it
   before Phase 7; the service-role key is marked Sensitive. The function region near
   the database (open decision 4). Deployment Protection per open decision 11. On the
   preview: `x-vercel-cache` MISS → HIT → STALE on `/api/live`, by GET (`curl -s -o
   /dev/null -D -`), not `curl -I`, which sends HEAD; `/map` in a real
   browser (basemap from R2, markers, a popup); requests per visit from Vercel's usage
   dashboard; the build's `node -v` and `npm -v`, recorded on #139. Ride along:
   `README.md`'s preview-deploy notes. *Last of the build steps: it needs all of the
   above.*
7. **#139: Node and npm minimums in `package.json`.** As that issue describes, with
   step 6's versions (open decision 9), and a preview deploy that still builds.
8. **Phase 6 retrospective**, by the milestone-retrospective procedure in
   `.claude/process-log.md` ("How to use it").
9. **Follow-up issues** the retrospective opens, if any.
10. **Reconcile `project-context.md`** (the end-of-phase task), which also sets
    `CLAUDE.md`'s bold "Current phase plan" line back to none, naming this plan as the
    last one.

    Steps 8–10 are ordered, blocked and closed as that procedure's part 6 says; this
    plan doesn't restate it. Step 10's content: Part 1's "What runs" (live data, no
    fake data), "Map tiles" (R2), "Database" (the hosted checks' results), "Modules
    kept on purpose" (the `map-types.ts` and `fake-data.ts` rows go; `services/live.ts`,
    `live.ts` and `api/live` come in), "Folder structure", "Environment" (the R2 URL,
    the hosted key type), "Tests and gates" (the integration file count), "Versions"
    (the Node/npm line after #139), the Roadmap row; Part 2's "Read path" section,
    which becomes a description of what was built, and the Phase map's Phase 8 row
    (tiles on R2 moved here, #7). It replaces each **between phases** marker in
    "Decisions carried forward" with the decision here that took it up (#1–#6), and
    carries forward this plan's decisions that outlive the phase (likely #7, #9–#11,
    #17, #18).

---

## Rationale

### #1 — Pre-deploy automation is Phase 8's, as one piece

The owner's call (between phases, 2026-10-24, IS #176): CI/CD (the four gates in GitHub
Actions), SAST (SonarQube Cloud preferred), a pre-commit and CI secret scan, Dependabot
security updates once CI runs, and branch protection are designed together and built
before Phase 8's production deploy. Nothing of it is in this phase, the preview deploy
included. Where it is written down: `project-context.md` Part 2, "Pre-deploy automation
(planned)".

### #2 — "Gates stay manual until deploy" means the production deploy

The owner's reading (between phases, 2026-10-24, IS #176) of the 2026-09-06 decision:
the deploy is the official production deploy, not this phase's preview deploy. So step 6
brings no CI with it; the four gates stay manual (`CLAUDE.md`, "Testing").

### #3 — Two-factor authentication on every account, not by SMS

The owner's call (between phases, 2026-10-24, IS #176): every account that can reach the
project uses 2FA by passkey, hardware key or authenticator app, set up when the account
is created, and all are checked again before the production deploy. This phase creates
the first hosted accounts (Cloudflare in step 4, a Supabase org in step 5, Vercel in
step 6), so each step's acceptance criteria include it. The rule is `CLAUDE.md`'s
("Secrets"); which accounts meet it is `project-context.md`'s "Pre-deploy automation
(planned)", which step 10 updates.

### #4 — Every pre-deploy credential is rotated before the production deploy

The owner's call (between phases, 2026-10-24, IS #176): every credential that exists
before the production deploy is rotated, or replaced by a new project's. In this phase
it means the preview project's keys are preview keys only: nothing from steps 4–6 is
reused for production as it is (#18).

### #5 — Where hosted secrets live

The owner's call (between phases, 2026-10-24, IS #176): hosted secrets for deploys and CI
live in Vercel environment variables (marked "Sensitive" where offered), GitHub Actions
secrets and Dependabot secrets; a developer's own copies stay on their machine; none in a
tracked or shared file. In this phase: the preview project's keys go into Vercel's
preview-scoped variables (step 6) and the owner's `.env.local`, never into `README.md`,
an issue, a PR or the process log.

### #6 — `experimental.agentUpgrade: false` stays

The owner's call (between phases, 2026-10-24, IS #178): `next.config.ts` keeps it off, so
an agent-run `next build` or `next dev` doesn't fail, or query the advisory source, when
an advisory covers the installed Next. Advisories reach the owner through Dependabot
alerts and `npm audit`. This phase's builds, step 6's on Vercel included, run with it.

### #7 — Tiles on R2 now, pulled forward from Phase 8

The owner's call, 2026-10-25. `public/*.pmtiles` is gitignored, so a Vercel build has no
tiles and the preview would draw an empty basemap. Considered: serving the file from
Vercel for previews (committed or uploaded), which isn't the launch setup and spends
Hobby's 1M CDN requests on tiles, the bigger request consumer (`project-context.md`,
"Pricing"); or accepting a blank basemap on the preview and checking tiles only locally.
R2 makes the preview test the launch tile path, where the known failure modes are
(CORS, range requests: "the map loads blank" without the CORS rule, "Pricing"). Dev
keeps the local file. Only the tile hosting moves; the rest of Phase 8 doesn't.

### #8 — Done is a preview with hand-loaded data

There is no admin screen until Phase 7, so the hosted project's rows come from the seed
or hand-written SQL (open decision 2). The phase proves the read path, the cache and the
tiles; who writes the rows is Phase 7's.

### #9 — The `is_active` filter lives in the service

Settles Phase 5 plan open decision 6. `getLiveMap` reads `listActiveTrucks()` and
`findLocationsOverlapping()` in parallel and keeps the rows whose `truck_id` is an active
truck. Considered: a new db function with an embedded `trucks!inner(is_active)` join, one
round trip, but a new select string, embedded-resource row typing and another key-set
test. Two small reads, one of a table of tens of rows, need no change to the db layer.
The service also needs the trucks anyway, for the popup's fields.

### #10 — The first service arrives in Phase 6

`project-context.md` expected `src/lib/services/` in Phase 7. `/api/live` needs it now:
routes are HTTP only and call services (`CLAUDE.md`, "Architecture Rules"), and the
clock read belongs in a service (`CLAUDE.md`, "Time"; the db layer reads no clock, Phase
5 plan decision #10).

### #11 — The response is `{ entries }`, built field by field

Each `LiveEntry` carries the location's fields the client needs and a subset of its
truck's. The service names every field rather than spreading a row: a second guard after
the explicit select (`CLAUDE.md`, "`/api/live`"), so `cancelled_at`, `source`,
`created_at`, `is_active`, `description` and any future column stay on the server, as
`created_by` already does. An object rather than a bare array leaves room to add a
field without changing what the body is.

### #12 — One marker per truck

The owner's call, 2026-10-25. A truck with two entries today (lunch at A, dinner at B)
shows A until lunch ends, then B: the open entry, else the next one today. Two pins for
one truck at once were judged more confusing than useful.

### #13 — A NULL `label` leaves the line out

Settles Phase 5 plan decision #12 ("The popup's handling of a missing label is Phase
6's").
The owner's call, 2026-10-25. The coordinates are on the map already; a placeholder like
"Okänd plats" would read as an error.

### #14 — The marker diff is a pure function

The Phase map has `useLocations` doing "marker diffing". Here the hook holds the state,
`diffMarkers` in `live.ts` computes the diff, and `useMapLibre` applies it to MapLibre.
So the diff, where "never fully re-render the map" (`CLAUDE.md`, "UI Rules") lives, is
unit-tested without a DOM or MapLibre.

### #15 — Components never read the clock

The owner's call, 2026-10-25. `now` reaches `TruckPopup` as a prop from `useLocations`'s
30 s tick. Components only describe what to render (`CLAUDE.md`, "UI Rules"); the
clock, like other state, lives in hooks.

### #16 — A failed poll keeps the last good data

The owner's call, 2026-10-25. The 30 s tick still removes entries whose `ends_at` passes,
so stale data can't keep an ended truck on the map. Whether the map also says it is stale
is open decision 6.

### #17 — No segment config on the route; the build output proves it is dynamic

The installed docs (`node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`,
"Caching") say route handlers are not cached by default without Cache Components, which
this repo doesn't enable. A doc statement is not a probe, so step 2 records `next
build`'s line for `/api/live` (ƒ, Dynamic). With ISR or a prerender the database would
have to be reachable during `next build`, and the CDN copy comes from the
`Cache-Control` header instead (`project-context.md`, "Read path").

### #18 — The preview database is a separate, disposable project

A free project in a separate free org (`project-context.md`, "Pricing": keep preview
projects in a separate free org, or delete them at launch). Its keys are preview keys
(#4); production gets a new project in Phase 8.

### #19 — No migration unless a hosted check forces one

The schema is Phase 5's and its tests hold it locally. If a hosted check fails (the
collation, the extensions, the trigger form), its fix is decided first; a migration is
`0002_<name>.sql` (Phase 5 plan decision #23) with its own decision here.

### #20 — The service drops a row the client's guard would reject

The owner's call, 2026-10-31, in PR #190's review round 1. `isLiveResponse` rejects a
whole body for one bad entry, and the schema allows rows it rejects: `ends_at =
'infinity'` passes the only time check (`ends_at > starts_at`), and coordinates have no
range CHECK (`0001_baseline.sql`). One such row, entered by hand-written SQL before
Phase 7's validators exist, would make every poll fail: a visitor already on the map
keeps the last good data (#16), and one who opens it while the row exists sees no
trucks at all. So `getLiveMap` checks each entry it builds with `isLiveEntry` (exported from
`live.ts`) and leaves out one that fails, logging its location id. The client still
rejects a malformed body as a whole: that now means a broken server or contract, and
the hook keeps its last good data (#16). Considered: the client dropping bad entries
(a broken server would then look like an empty map); database CHECKs (a migration,
against #19); accepting the risk.

### #21 — The popup's hours name a day that isn't today

The owner's call, 2026-10-31, in PR #190's review round 2. `todaysEntries` keeps an
entry that started yesterday or runs past midnight, and bare `HH:MM–HH:MM` read
`"20:00–12:00"` for one. So `hoursText(entry, now)` puts `igår` before a start on the
day before `now`'s Stockholm day and `imorgon` after an end on the day after, and a
date (`"29 okt"`, with the year when it isn't `now`'s) for any other day; a same-day
entry stays `"11:00–14:00"`. The end's day is named only when it differs from the
start's (`"igår 20:00–24:00"`). An end at exactly midnight is `24:00` on the day it
closes (`"20:00–24:00"`, `"20:00–24:00 imorgon"`): round 3 found that round 2's
`"00:00"`, with the day word of the day before, read `"20:00–00:00 imorgon"` for an
entry open until the end of tomorrow. Considered: keeping the bare form
(`"23:00–02:00"` reads naturally, and such entries are rare); deciding with the popup
in step 3.

---

## Acceptance Criteria

**Plan (step 0)**
- [ ] This plan is merged into `dev`, and `CLAUDE.md`'s bold "Current phase plan" line
  names it; no other line of `CLAUDE.md`'s header changes.

**Contract and helpers (step 1)**
- [ ] Unit tests pass for `todaysEntries` (ended out; starting at or after the next
  Stockholm midnight out; started yesterday and still running in; both 2026 DST days,
  03-29 and 10-25), `markerFor` (open beats later; two later entries give the earliest;
  only ended entries give no marker; an entry starting tomorrow gives none),
  `diffMarkers` (add; update on entry id, position,
  status and a popup field; remove; no change gives an empty diff; an empty `prev`
  gives every marker as an add), `isLiveResponse` (accepts `{ entries: [] }` and a full
  entry, and one with `label`, `instagram_handle` and `cuisine_type` null; rejects
  `{ error }`, `{}`, `null`, and a body with one otherwise valid entry broken in one
  field: each field of `LiveEntry` in turn, missing or of the wrong type, a non-finite
  coordinate, a latitude past ±90 and a longitude past ±180, and timestamps of `"1"`,
  `"2026"`, an offset of `+24:00` and an hour of 24; accepts timestamps with and without
  fractional seconds, `…T09:00:00+00:00` and `…T05:12:07.123456+00:00`) and the text
  helpers
  (`"11:00–14:00"`, `"igår 20:00–12:00"`, `"23:00–02:00 imorgon"`, `"Uppdaterad 08:12"`,
  `"Öppet nu"`, `"Öppnar 17:00"`, all in
  Stockholm time).
- [ ] `src/lib/live.ts` imports no React and no env, and reads no clock: a grep shows no
  argument-less `new Date()` and no `Date.now()`.

**Server (step 2)**
- [ ] `GET /api/live` returns 200 with `Cache-Control: public, s-maxage=60,
  stale-while-revalidate=60`, and no `Set-Cookie`, `Vary: Cookie`, `private` or
  `no-store`.
- [ ] The body is `{ entries }`; each entry's key set, and its `truck`'s, equal
  `LiveEntry`'s, by a key-set test like the db layer's. No `created_by`, `cancelled_at`,
  `source` or `is_active` anywhere in the body.
- [ ] Excluded, each by its own test: a cancelled row, an ended row, a row starting at
  or after `now + 26 h`, an inactive truck's row. Included, by a test with `now` at
  2026-10-25 00:10 Stockholm (the fall-back day): a row starting at 23:30 that day,
  about 24 h 20 min later.
- [ ] A throwing service or db layer gives 500 `{ "error": "Internal server error" }`,
  never a 200 with no entries, by a test.
- [ ] A row that fails `isLiveEntry` (e.g. `ends_at = 'infinity'`, a latitude of 95) is
  left out and the other rows are returned, by a test (#20).
- [ ] `npm run build` lists `/api/live` as ƒ (Dynamic), recorded in the PR; the route
  file exports only `GET`.
- [ ] The route imports only the service (and `next/server`, the handler): nothing from
  `src/lib/db/` or `src/lib/supabase.ts`.

**Client (step 3)**
- [ ] `fake-data.ts` and `map-types.ts` are deleted; a grep of `src/` for `confidence`,
  `last_known`, `is_negation`, `MarkerColor`, `fake-data` and `map-types` finds nothing.
- [ ] No `useState` or `useEffect` in a component.
- [ ] In a real browser, in `npm run dev` (StrictMode on) against local Supabase just
  after `npx supabase db reset`: the basemap, one marker per truck with an entry today, a popup with name, label, status, hours, "Uppdaterad
  HH:MM" and the Instagram link; a row inserted by SQL appears within one poll (at once
  on refocusing the tab), and cancelled disappears, while the other markers keep their
  elements; a label and a position changed by SQL show after the next poll, in a popup
  left open (which moves with its marker) and in one opened afterwards; a popup closed
  by a map click, then a 30 s tick, gives no React error in the console. The server's own `Local:` line is read first and no repo `node` process is
  left after (`CLAUDE.md`, "Testing").
- [ ] With the markers showing, `npx supabase stop` makes `/api/live` fail (500): the
  markers stay through the next poll, and come back in sync after `npx supabase start`
  (#16).
- [ ] The empty state (open decision 7) shows only when `fetchState` is `ok` with no
  markers: not before the first response, and not with `/api/live` failing from the
  first load (`npx supabase stop` before opening `/map`). In `npm run dev`, StrictMode's
  aborted first fetch doesn't set `failing`.
- [ ] `CLAUDE.md`'s UI Rules and `README.md`'s status line and "What works today" no
  longer describe the fake-data map.

**R2 (step 4)**
- [ ] The tile file is in an R2 bucket served over HTTPS with the CORS rule of step 4.
- [ ] `/map` locally with `NEXT_PUBLIC_PMTILES_URL` at R2 draws the basemap in a real
  browser, and a tile request returns 206 with `Access-Control-Allow-Origin`, recorded
  in the PR. The server's own `Local:` line shows the origin the CORS rule allows
  (a stale process on :3000 moves a new server to :3001, which it doesn't), and no
  repo `node` process is left after (`CLAUDE.md`, "Testing").
- [ ] `README.md`, `.env.example` and `CLAUDE.md`'s Tech Stack line describe R2 for
  deploys and the local file for dev.
- [ ] The Cloudflare account has non-SMS 2FA (#3).

**Hosted Supabase (step 5)**
- [ ] The preview project is in a separate free org with non-SMS 2FA, and `db push` of
  the baseline succeeded.
- [ ] Each hosted check has a recorded result whose command could have shown it false:
  a query of `trucks.name`'s collation shows `sv-SE-x-icu`; a query shows `btree_gist`
  and `moddatetime` in `extensions`, and an UPDATE moves a row's `updated_at`; the Data
  API `max_rows` read in the dashboard is ≥ `MAX_ROWS`.
- [ ] With the anon key, a SELECT on `trucks` and on `locations` through the hosted REST
  API is refused with `42501`, not answered with an empty list, which a SELECT grant
  without a policy gives (`rls.test.ts:140`, under the dropped-policy control). The hint
  is recorded: locally it names
  SELECT (`rls.test.ts`'s `expectRefused`), but it was seen only on the local
  Postgres 17.6, so a hosted refusal with no hint or another one is recorded, not a
  failure.
- [ ] The project holds at least one active truck with an entry spanning the check time
  of step 6.

**Preview deploy (step 6)**
- [ ] The preview builds; every variable `src/lib/supabase.ts` and `useMapLibre` read
  is set, preview-scoped, and the service-role key is marked Sensitive.
- [ ] GET requests to `/api/live` (headers dumped, past Deployment Protection per open
  decision 11) show `x-vercel-cache: MISS`, then `HIT` within 60 s, then `STALE`
  between 60 and 120 s, with the output in the PR or issue.
- [ ] `/map` on the preview in a real browser shows the basemap from R2, the markers and
  a popup.
- [ ] Requests per visit, from Vercel's usage dashboard, are recorded with the visit
  that produced them.
- [ ] The build's `node -v` and `npm -v` are recorded on #139.
- [ ] The Vercel account has non-SMS 2FA (#3).

**#139 (step 7)**
- [ ] #139's acceptance criteria hold, and a preview deploy with the new fields builds
  and its `/map` draws the basemap from R2 (a new preview origin is where open decision
  10's CORS rule would fail).

**Gates (every step with a code or config change)**
- [ ] `npx tsc --noEmit`, `npm run lint`, `npm run test:all`, `npm run build` exit 0,
  read unpiped; each PR records both vitest projects' file and test counts.

**Closing**
- [ ] The closing steps of the milestone-retrospective procedure are done: the Phase 6
  retrospective (step 8), its follow-ups merged (step 9), and the `project-context.md`
  reconciliation merged (step 10).

---

## Open Decisions

1. **R2 public access (step 4).** A custom domain on Cloudflare DNS, or the bucket's
   `r2.dev` URL. A custom domain needs a domain, and the app name is open; Cloudflare
   rate-limits `r2.dev` and says it isn't for production. Lean: `r2.dev` for the
   preview, the custom domain in Phase 8.
2. **The hosted project's data (step 5).** `db push --include-seed`, whose times are
   relative to the push (its row spanning `now()` spans only push time), or a small
   SQL snippet run before each check, or both (the seed for trucks and history, a
   snippet for today's entry).
3. **Which Supabase key type (step 5).** A new project may default to the newer
   publishable and secret keys instead of the legacy anon and service_role ones.
   `.env.example`'s names and #4's rotation depend on it; decided when the project is
   created, with the variable names revisited if needed.
4. **Regions (steps 5, 6).** Supabase in `eu-north-1` (Stockholm) and Vercel's function
   region near it (`arn1`); confirm what Hobby allows.
5. ~~**`freshnessText` for an update not made today (step 3).**~~ → **answered in step
   1 (#182), the owner's call, 2026-10-31:** by Stockholm calendar days between
   `updated_at` and `now`. The same day (or a later one, a client clock behind the
   server's): `"Uppdaterad 08:12"`. One day: `"Uppdaterad igår 18:30"`. Two to six:
   the weekday, `"Uppdaterad i måndags 09:14"`. Seven or more: the date, `"Uppdaterad
   24 okt 09:14"`, with the year only when it isn't `now`'s (`"Uppdaterad 20 dec 2025
   09:00"`). Month names are written out in `live.ts` (`jan`, `feb`, `mars`, `apr`,
   `maj`, `juni`, `juli`, `aug`, `sep`, `okt`, `nov`, `dec`), not taken from a
   `date-fns` locale. Why the weekday: a truck may post its whole week at once, so most
   popups show an update from earlier in the week, and a weekday reads faster than a
   date there. The question as planned: E.g. "Uppdaterad igår 18:30" or "Uppdaterad 3
   okt 18:30"; it matters for an entry entered the evening before.
6. **A stale notice when polls fail (step 3).** The principles say the map should say
   honestly when it's stale (`project-context.md`, "Principles and risks"). A small
   "Kunde inte uppdatera" now, or later (#16).
7. **The empty state (step 3).** What `/map` says when no truck has an entry today,
   e.g. "Inga foodtrucks ute just nu".
8. **Marker look (step 3).** Colour and size of open (filled) versus later (outlined),
   settled at the browser check.
9. **#139's `onFail`, and whether to pin `engines.node` (step 7).** As that issue
   describes, from step 6's build log.
10. **The R2 CORS rule's allowed origins (step 4).** Vercel preview URLs differ per
    deployment and per branch, so one named preview origin breaks the next preview's
    basemap. Options: `*` while only previews exist (the tiles are public), or one
    pattern (R2's CORS docs, read 2026-10-25: an origin may hold one `*`, which can
    span periods). `https://*.vercel.app` admits every `vercel.app` site;
    `https://<project>-*.vercel.app` also admits anyone's project whose name starts
    `<project>-`; `https://<project>-*-<scope>.vercel.app` matches this account's
    preview URLs (`<project-name>-<unique-hash>-<scope-slug>` and
    `<project-name>-git-<branch-name>-<scope-slug>`, Vercel's generated-URLs docs, read
    2026-10-25) and is the narrowest, though a project name chosen to end in
    `-<scope>` still matches. Vercel truncates a label over 63 characters (same page),
    so a long branch name can cut the `-<scope>` suffix and miss the pattern.
    Whichever is chosen, Phase 8 replaces it with the end state `project-context.md`
    "Pricing" gives (the domain and localhost). Not probed until the bucket exists.
    Local dev's origin is `http://localhost:3000`.
11. **Deployment Protection on previews (step 6).** With Vercel Authentication on (all
    plans, Hobby included), a request without its cookie gets a Vercel login redirect,
    not the route, so it has no `x-vercel-cache` (Vercel's docs, read 2026-10-25).
    Vercel's generated-URLs page says a generated URL "is publicly accessible by
    default", but a team default can turn protection on for new projects (its
    Deployment Protection page), so step 6 reads the project's settings. If it is on: turn it off for previews, or
    send a Protection Bypass for Automation token with the cache check's requests. The
    token is a secret (#5): the command reads it from an environment variable, and only
    the response headers are recorded in the PR or issue, never the command line with
    the token or the query-string form of it (`CLAUDE.md`, "Secrets").

Product decisions #1 (retention), #2 (checklist look-back), #3 (default times) and #4
(app name) stay open for Phases 7–8; this phase doesn't wait on them.
