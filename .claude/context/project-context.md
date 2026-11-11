# Foodtruck Map Gothenburg — Project Context

> **This document has been wrong before.** When a rule here turns out to be stale,
> incorrect, or is followed and causes a defect, fix it *and* append a row to
> `.claude/process-log.md` — see the "Process Log" section in `CLAUDE.md` for the
> triggers. That file is how we find out which parts of this one keep failing;
> `project-context` and `CLAUDE.md` are both already named in it.

**How to read this file.** It was rewritten at the end of Phase 4 (#127) and
reconciled at the end of Phases 5 (#165), 6 (#189) and 7 (#234). It has three parts:

1. **Current state** — what exists on `dev` after Phase 7. Trust it for "what is the
   code doing today".
2. **Target design** — the design from Phase 5 on, the Owners phase's principles
   included, condensed from `.claude/transition.md` (now history). Trust it for "what
   are we building", never as a description of the code. The exceptions are the
   sections marked "built in Phase 5", for what they say about the **schema** (Part 1's
   "Database" says it matches them), "Read path", marked "built in Phase 6", "Admin
   and auth", marked "built in Phase 7", and the Product model's launch items where they
   cite a Phase 7 plan decision.
3. **Standing rules** — conventions that hold in both.

The current phase plan wins over this file. This file is reconciled with reality at
the end of each phase; between those points the plan carries what was settled. Between
phases (after a reconciliation, before the next plan) there is no current plan, and
this file is current.

---

## What We're Building

A map showing where Gothenburg's food trucks are **today**. Hungry people open it,
with no login and no tracking, and see which trucks are out, where, and until when.

At launch one admin enters every location by hand, from a phone-first admin screen,
after following every truck on Instagram with post and Story notifications on. Truck
owners claim their listing and post themselves later (the Owners phase).

## The Problem

Food trucks in Gothenburg announce where they are on Instagram and Facebook. There
has been no central map since Streetkäk shut down in 2017. The gap is real and still
open.

## Roadmap

| Phase | Name | Status |
|---|---|---|
| 1 | Foundation: map with fake data | done |
| 2 | Ingestion: email and webhook lanes | done; removed in Phase 4, schema replaced in Phase 5 |
| 3 | Parser: Swedish caption parser | stopped; removed in Phase 4 |
| 4 | Housekeeping: remove the old design, upgrade dependencies, rewrite the docs | done |
| 5 | Schema reset | done |
| 6 | Live read path (first preview deploy) | done |
| 7 | Admin | done |
| 8 | Launch (first production deploy) | next; no plan yet |
| later | Owners; optional automation | — |

Phase contents are under "Target design → Phase map".

**The old design is archived** on the branch **and** tag `archive/parser-lanes`, at
commit `b089fd09e9d13f296eae5bdb549b99effa05f5c5` (`b089fd0`, the merge of PR #119).
It was cut after PR #117 tracked `.claude/`, so it holds the parser, the lanes and
geocoding **together with** the plans, process log and docs that explained them. The
tag is annotated: `git rev-parse 'archive/parser-lanes^{commit}'` gives the commit.

**Don't re-add** what Phase 4 removed (ingestion lanes, parser, geocoding, confidence
scoring, Realtime, cron, Upstash) or what `transition.md` §0 simplified away (a
`schedules` or `spots` table, `expires_at`, automatic replace-on-overlap, ISR,
save-triggered cache purges, grey markers) without a concrete problem that needs it.
§0's table says why each one went.

---

# Part 1 — Current state (after Phase 7)

## What runs

- `/` redirects to `/map`. `/map` renders MapLibre over PMTiles with Swedish labels
  (`@protomaps/basemaps`, `lang: "sv"`), centred on Gothenburg: a local file in
  development, Cloudflare R2 on a preview ("Map tiles").
- **Markers come from `GET /api/live`**, the one public API route: route → `getLiveMap`
  (`src/lib/services/live.ts`) → the db layer. Part 2's "Read path" (built in Phase 6)
  describes it, server and client: the markers, the popup, polling and failure.
- **A preview deploy** runs on Vercel against a hosted Supabase preview project, with
  the tiles on R2. `README.md`'s "Preview deploys" and "Hosted preview database" are
  the one description of that setup. There is no production deploy (Phase 8).
- **The admin screens** (Phase 7), Swedish and phone-first: `/admin/login` (an emailed
  magic link), `/admin` ("Poster": the morning checklist, the entry form with its place
  picker, and the list of entries from today for 14 days, each with "Stämmer fortfarande"
  and "Ställ in", and "Ändra" until it ends) and `/admin/trucks` ("Foodtrucks": add,
  edit, set inactive or active). Part 2's "Admin and auth" (built in Phase 7) describes
  them.
- **The admin API** is under `/api/admin/`: `trucks`, `trucks/[id]`, `locations`,
  `locations/[id]`, `locations/[id]/cancel`, `locations/[id]/confirm`, `places` and
  `checklist`, every handler inside `withAdmin`. `/auth/callback` and `POST
  /auth/logout` sit outside it (Phase 7 plan #28).
- `src/proxy.ts` checks the session cookie and `is_admin` for `/admin/:path*` and
  `/api/admin/:path*`, letting `/admin/login` through (`CLAUDE.md`, "proxy.ts").

## Map tiles

`public/*.pmtiles` is gitignored, so a fresh clone has no tiles and the map draws an
empty background. The README ("Get the map tiles") gives the command: `pmtiles
extract` from a recent Protomaps daily build, with the bounding box from
`src/lib/geo.ts`. Development uses the local file,
`NEXT_PUBLIC_PMTILES_URL=/gothenburg.pmtiles`.

**Deploys read the same file from Cloudflare R2** (Phase 6 plan decision #7: pulled
forward from Phase 8, so a preview tests the launch tile path). The bucket is served
from its `r2.dev` URL for previews (open decision 1); Phase 8 moves it to a custom
domain. Its CORS rule admits `http://localhost:3000` and a pattern for this project's
Vercel preview URLs (open decision 10). What that rule admits and doesn't, and how to
check the bucket, is `README.md`'s "Get the map tiles", the one description.

MapLibre's worker is copied from `node_modules` into the gitignored
`public/maplibre/<version>/` by `scripts/copy-maplibre-worker.mjs`, run as the
`postinstall`, `predev` and `prebuild` hooks. MapLibre's documented
`setWorkerUrl(new URL(…, import.meta.url))` form 404'd under Next 16.3's Turbopack, with
every gate green (Phase 4 plan decision #13, process-log row 282). It wasn't retested on
16.4, where the copied worker loads (IS #178).

## Versions

| Package | Version | Note |
|---|---|---|
| `next`, `eslint-config-next` | 16.4.5 | exact pins; upgrade together |
| `react`, `react-dom` | 19.2.4 | |
| `maplibre-gl` | 6.11.2 | exact pin |
| `@protomaps/basemaps` | ^5.7.2 | replaced the deprecated `protomaps-themes-base` |
| `pmtiles` | ^4.5.0 | |
| `@supabase/supabase-js` | ^2.106 | |
| `@supabase/ssr` | ^0.10.3 | cookie sessions for the admin (Phase 7 plan #12) |
| `server-only` | ^0.0.1 | makes `src/lib/supabase.ts` fail a client build (IS #221) |
| `date-fns` | ^4.3 | `parseISO` and `isValid` only; Stockholm wall time is `src/lib/stockholm.ts`'s (`CLAUDE.md`, "Time") |
| `date-fns-tz` | ^3.2 | imported nowhere since PR #252; IS #253 removes it |
| `vitest` | ^4.1.12 | pulls in `vite` 8 |
| `supabase` CLI | ^2.109 | dev dependency |

Toolchain: `package.json`'s `devEngines` admits Node `26.x` and npm `>=11.0.0`, with
`onFail: "error"`, and `engines.node` is `26.x`, the major Vercel builds with (#139,
#199; Phase 6 plan open decision 9). Vercel's preview build ran Node 26.13.0 and npm
11.20.0, and the gates have run on 26.13.0 only, not an early 26.x. Why each range, and
which npm reads `devEngines`, is `CLAUDE.md`'s ("Dependencies").

On 2026-11-03 `npm audit` reported 16 moderate findings, all from one advisory,
GHSA-g3hv-75wg-m249 (`minimatch` before 11.0.1, in dev dependencies only), and `npm
audit --omit=dev` found 0 vulnerabilities. The owner dismissed Dependabot alert #7 for
it: Phase 6 plan decision #24 lists the copies, the ranges holding them and when to
revisit. That is a dated result: re-run both before relying on it. Dependabot alerts
are on, but an auto-triage rule can dismiss low-impact alerts on development
dependencies ("Pre-deploy automation (planned)", "Already on"). `next.config.ts` sets
`agentRules: false` (Phase 4 plan decision #12), `experimental.agentUpgrade: false`
(Phase 6 plan decision #6; `CLAUDE.md` "Dependencies") and, for `next dev` only,
`allowedDevOrigins: ["127.0.0.1"]`, so the app opened at `127.0.0.1:3000` (Supabase's
`site_url`) loads its dev resources (the file's comment has the evidence, IS #222).

## Database (the Phase 5 baseline)

One migration, `supabase/migrations/0001_baseline.sql`, creates the target design's
schema: Part 2's "Data model" and "RLS and grants" describe it, and the integration
tests hold it there. The reasons are the Phase 5 plan's numbered decisions, cited
below as "#n".

- Three tables, `trucks`, `locations`, `users`, with every column's nullability and
  default stated (#16, #17). `locations.source` is the enum `location_source`
  (`'admin' | 'owner'`, #18); `trucks.name` is `collate "sv-SE-x-icu"`, so "ordered
  by name" is Swedish order (#19).
- `locations_no_overlap`, the exclusion constraint, and `CHECK (ends_at > starts_at)`,
  which the constraint needs: an empty range overlaps nothing, so a row with `ends_at =
  starts_at` would pass the constraint without it. Never relax the CHECK (#4).
- The `locations_updated_at` trigger (`moddatetime`, #5). Its `WHEN` skips every
  UPDATE that clears `created_by`: it exists for the one an auth user's deletion runs
  through `created_by … on delete set null`, but it can't tell that one from an edit
  (the SQL rule for that is `CLAUDE.md`'s, "db layer").
  `btree_gist` and `moddatetime` both live in the `extensions` schema.
- Two partial btrees, one per read; the constraint's GiST index serves overlap checks.
  Another index waits for a measured query that needs it (#14).
- Foreign keys to `trucks` (`locations.truck_id`, `users.truck_id`) and `users.id →
  auth.users` are `NO ACTION`: deleting a truck with history fails with `23503`, so
  only the takedown removes history (#7). **The exception is `locations.created_by →
  auth.users`, `on delete set null`** (#8): deleting an auth user with no `users` row
  clears `created_by` on every row they wrote. One who has a `users` row (every admin
  and owner) can't be deleted until that row is: `users_id_fkey` refuses it, `23503`,
  and `created_by` stays (probed in a rolled-back transaction, 2026-10-24).
- RLS on all three; per table, `revoke all` from `anon`, `authenticated` and
  `service_role`, then the grants of Part 2's table (#6). The one policy is
  `users_select_own`.
- Coordinates are `float8` with no CHECK; the Gothenburg box is the location
  validator's (`src/lib/validators/location.ts`, #13).
- `supabase/seed.sql`: three fixed-UUID trucks (Vintervilan inactive, with no rows)
  and four weeks of 11:00–14:00 Stockholm history ending yesterday, plus one row
  spanning `now()`, all relative to the reset (#15). The hosted preview project loaded
  it once, so its history doesn't move with the date (`README.md`, "Hosted preview
  database", which also records the rows written there by hand since).

`src/lib/database.types.ts` is generated from it, **in Git Bash** (PowerShell 5.1's
`>` re-encodes the file): `npx supabase gen types typescript --local >
src/lib/database.types.ts`. `src/lib/types.ts` derives `Truck`, `Location` (without
`created_by`), `NewLocation` and `LocationPatch` from it with no narrowing by hand.

**The db layer** (`src/lib/db/`):
- `trucks.ts`: `getActiveTruckById`, `listActiveTrucks`, `listAllTrucks`,
  `insertTruck`, `updateTruck`. No delete.
- `locations.ts`: `insertLocation`, `updateLocation`, `cancelLocation`,
  `confirmLocation`, `getLocationById`, `findLocationsOverlapping`,
  `findTruckLocationsOverlapping`, `listRecentLocationsForTruck`. No delete.
  `findLocationsOverlapping(from, to)` serves the live window, the admin list and the
  checklist's day windows (#9), and **doesn't filter on `is_active`**: `getLiveMap` does
  (Phase 6 plan decision #9).
- `users.ts`: `getUserById`, which reads `is_admin` for the admin check (Phase 7 plan
  #14).
- `pick.ts`: `pick`, the copy of a write's allowed keys that `locations.ts` and
  `trucks.ts` send.
- `complete.ts`: `MAX_ROWS` (pinned to `config.toml`'s `max_rows` by its unit test)
  and `assertAllRows`, which list reads without a `limit` use to throw when `max_rows`
  cuts them.

Its rules are `CLAUDE.md`'s ("db layer" under Hard Rules); the plan's "Functions and
types" section has each function's contract.

**Checked on the hosted preview project too** (2026-11-02, #186's PR #195; `README.md`
"Hosted preview database"): `trucks.name`'s collation reads back `sv-SE-x-icu` (#19);
`btree_gist` and `moddatetime` are both in `extensions`, and the migration, trigger
included, applied (#5); the API roles' table grants in `public` are the migration's
(`README.md`, "Hosted preview database", gives the query and the result), and `anon`
gets `42501` on all three tables; the Data API's **Max rows** is 1000, equal to
`MAX_ROWS` (`complete.ts` holds the value read). Max rows is set in the dashboard, not
from `config.toml`, so a new hosted project (production's, Phase 8) is read there
before the app uses it: below `MAX_ROWS`, a `listRecentLocationsForTruck` call whose
`limit` is above the hosted cap would return a cut result with no error (PR #167 round
5). The rule is `CLAUDE.md`'s ("db layer").

## Modules kept on purpose

| Module | What it is | Used again in |
|---|---|---|
| `src/lib/live.ts` | the `/api/live` contract (`LiveEntry`, `LiveResponse`) and its guards (`isLiveEntry`, `isLiveResponse`), and the map's pure helpers: `todaysEntries`, `markerFor`, `diffMarkers`, and the popup's and notice's text (+ test) | the server and the client both (Part 2, "Read path") |
| `src/lib/live-loader.ts` | `createLiveLoader`: the fetch rules (supersede, timeout, failure), unit-tested without a DOM (+ test) | `useLocations` |
| `src/lib/services/live.ts` | `getLiveMap`, the first service: the window, the `is_active` filter, the entries built field by field | `/api/live` |
| `src/app/api/live/route.ts` | `GET /api/live`: the service's result with `Cache-Control` (+ test) | every poll |
| `src/lib/http/handler.ts` | `withErrorHandling()`, the route error wrapper (+ test) | `/api/live`, `/auth/*`; `withAdmin` wraps it for the admin routes |
| `src/lib/basemap.ts` | `basemapLayers()`: the package's layers with Swedish labels, and no icon for the one POI kind the sprite lacks (+ test) | `map-setup.ts`, which `useMapLibre` and the place picker's `usePickerMap` share |
| `src/lib/geo.ts` | `GOTHENBURG_BBOX` and `isInGothenburg()` (+ test) | the location validator; `admin-place.ts` (map taps and GPS) |
| `src/lib/spots.ts` | `SPOTS`: known Gothenburg places with coordinates (+ test) | the place picker's known spots (`PlacePicker`, `usePlacePicker`, `admin-place.ts`) |
| `src/lib/validators/uuid.ts` | UUID check (+ test) | `http/id.ts` (path ids), the location validator, the places route |
| `src/lib/db/` | the db layer on the Phase 5 schema (see "Database") | `/api/live`; the admin services |
| `src/lib/supabase.ts` | `supabaseAdmin`, server only (`server-only`); the browser's Auth client is `supabase-browser.ts`'s, and the cookie-session clients `supabase-session.ts`'s (Phase 7 plan #12, #27) | the db layer and the integration tests (`CLAUDE.md`, "Supabase") |
| `src/lib/database.types.ts` | generated from the baseline (see "Database") | regenerated with each migration |
| `src/lib/types.ts` | row types **derived** from the generated ones, no narrowing by hand (`source` is an enum, Phase 5 plan #18) | `live.ts`, the db layer, the services and the admin modules |
| `src/lib/maplibre-worker.mjs` | worker folder and file list (+ test) | — |
| `scripts/seed-dictionary.mjs` | prints `Spot` stubs from OpenStreetMap for **human review**; never paste its output over `SPOTS`, which reverts hand-corrected pins | when adding spots |
| `scripts/test-all.mjs` | the `test:all` gate | — |
| `scripts/controls.mjs`, `tests/controls/*.sql` | the schema's negative controls; not a gate | when `CLAUDE.md` "Testing" says |
| `scripts/claims.sh` | the pre-review claims check (`CLAUDE.md`, "Review rounds") | every review round |
| `scripts/sweep.sh` | lists the sweep's candidates: removed text still elsewhere, moved or nowhere; added text repeated elsewhere (`CLAUDE.md`, "Review rounds"; IS #200) | every review round |
| `scripts/lib/diff.sh` | the diff reading `claims.sh` and `sweep.sh` share: flags, `git_diff`, `rev_end`, the untracked warning | both scripts |
| `scripts/process-log.sh` | `add` and `check` for the process log (`CLAUDE.md`, "Process Log") | every log row |

## Folder structure

Today's tree (tracked files; generated folders omitted). Each phase plan decides the
files it adds.

```
src/
├── app/
│   ├── layout.tsx, globals.css, favicon.ico
│   ├── page.tsx                  ← redirects to /map
│   ├── map/page.tsx
│   ├── admin/                    ← layout.tsx, page.tsx (Poster), login/page.tsx, trucks/page.tsx
│   ├── api/live/route.ts         ← (+ test)
│   ├── api/admin/                ← checklist, places, trucks, trucks/[id], locations,
│   │                               locations/[id], …/[id]/cancel, …/[id]/confirm
│   └── auth/                     ← callback/route.ts, logout/route.ts (+ tests)
├── components/
│   ├── Map/                      ← MapClient, MapView, TruckPopup
│   └── Admin/                    ← AdminLocations, Checklist, LocationForm, PlacePicker,
│                                   PickerMap, TodayList, AdminTrucks, TruckForm, TruckList,
│                                   AdminNav, LoginForm, LogoutButton, styles.ts
├── hooks/                        ← useMapLibre.tsx, useLocations.ts; the admin hooks
│                                   (see Part 3, "Hooks")
├── lib/
│   ├── db/                       ← trucks, locations, users, complete (+ test), pick
│   ├── services/                 ← live, locations, trucks, checklist, admin-auth,
│   │                               postgres (tests: locations, checklist, admin-auth)
│   ├── http/                     ← handler, admin (withAdmin), origin, id, entries, trucks
│   │                               (tests: handler, admin, origin)
│   ├── validators/               ← location, truck, uuid, body (tests: all but body)
│   ├── live.ts, live-loader.ts, stockholm.ts ← (+ tests); timestamp.ts
│   ├── admin-*.ts                ← the admin screens' helpers, and admin-api.ts's fetch
│   │                               wrapper (+ tests, but admin-list)
│   ├── basemap.ts, geo.ts, spots.ts ← (+ tests); map-setup.ts
│   ├── login.ts                  ← (+ test)
│   ├── supabase.ts, supabase-browser.ts, supabase-session.ts
│   ├── types.ts, database.types.ts
│   └── maplibre-worker.mjs       ← (+ test)
└── proxy.ts                      ← (+ test)
scripts/                          ← copy-maplibre-worker.mjs, seed-dictionary.mjs, test-all.mjs,
                                    controls.mjs, claims.sh, sweep.sh, lib/diff.sh,
                                    process-log.sh
supabase/                         ← config.toml, migrations/0001_baseline.sql, seed.sql
tests/integration/                ← setup.ts, helpers.ts (+ test), schema, rls, db-trucks,
                                    db-locations, db-users, api-live, auth-routes,
                                    admin-auth, api-admin-trucks, api-admin-locations,
                                    api-admin-checklist
tests/controls/                   ← one .sql per negative control, run by controls.mjs
public/                           ← gothenburg.pmtiles (development; deploys read R2) and
                                    maplibre/ (both gitignored)
.claude/                          ← plans, context, commands, process-log.md, transition.md
```

## Environment

`.env.example` lists four variables: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only, never
`NEXT_PUBLIC_`) and `NEXT_PUBLIC_PMTILES_URL`. The basemap needs only the last one;
the markers (`/api/live`), the admin (its login, the proxy and its routes) and the
integration tests need the Supabase three, which
`npx supabase status -o env` prints locally under other names: `API_URL` →
`NEXT_PUBLIC_SUPABASE_URL`, `ANON_KEY` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SERVICE_ROLE_KEY` → `SUPABASE_SERVICE_ROLE_KEY`. A preview takes all four from Vercel's
Preview-scoped variables: the hosted project's newer publishable and secret keys sit
in the same two names (open decision 3), and the tiles' URL is R2's. Where each value
comes from, and where the owner keeps copies, is `README.md`'s ("Hosted preview
database", "Preview deploys"); where secrets may live is `CLAUDE.md`'s ("Secrets").

## Tests and gates

Vitest with two projects, `unit` and `integration` (local Supabase, files run
sequentially). The integration project has twelve test files: `schema` (constraint,
CHECK, NOT NULL, enum, trigger, foreign keys, the unique Instagram handle), `rls`
(grants and the one policy, with signed-in auth-user fixtures), `db-trucks`,
`db-locations`, `db-users`, `api-live` (the route against the local stack),
`auth-routes` (callback and logout), `admin-auth` (every admin route, found on disk,
answering 401 and 403 with `no-store`: Phase 7 plan #13; the 503 cases are
`withAdmin`'s and `requireAdmin`'s unit tests), `api-admin-trucks`,
`api-admin-locations`, `api-admin-checklist` and `helpers`. On 2026-11-11 `test:all`
ran 27 unit files (692 tests) and 12 integration files (241 tests), and `npm run lint`
reported no warnings. There is no CI; the four
gates are run by hand: `npx tsc --noEmit`, `npm run lint`, `npm run test:all`, `npm run
build`. Details, and what the gates can't see, are in `CLAUDE.md` "Testing", which also
covers the schema controls (`node scripts/controls.mjs`: not a gate; when to run them
is there). Green gates don't show the map renders: look at `/map` in a browser after
any map, dependency or tile change.

---

# Part 2 — Target design

Condensed from `.claude/transition.md` (decided 2026-10-10, then reviewed). Its §0
table records what was simplified away and why; read it before adding anything back.

## Product model

**At launch**
1. **Admin-populated.** Instagram post and Story notifications per truck → open the
   admin screen → update.
2. **Morning checklist from history.** No schedules table: for each active truck, the
   admin screen looks back 4 weeks at today's weekday and takes the most recent day the
   truck had an entry starting then; all of that day's entries are suggested, moved to
   today by wall clock, so lunch and dinner both show (Phase 7 plan #22). ✓ creates
   today's entry through the ordinary create, overlap check included; ✗ hides the
   suggestion on that device for the day and writes nothing (#20). There is no "Alla
   stämmer" button for the whole list (open decision 8: not now, #232). **Nothing reaches
   the map until it is confirmed.**
3. **Fast entry.** A pin by map tap, a known spot (`SPOTS`), a recent place (from
   history) or GPS ("Jag är här nu"), with an optional place name (#35). Start and end
   times are pre-filled with 11–13, after 13:00 too (#23, #34; the checklist and a recent
   place bring their own), on a date that defaults to today (#24), and always required;
   an end at or before the start means the next day (#30). An entry that has ended can't
   be saved or edited (#33). A normal update should take under ~10 seconds: Phase 7's
   walkthrough timed 14 to 38 s with both times changed, recorded as neither passed nor
   failed (#232; IS #256).
4. **Overlaps are refused, not resolved.** A second entry for the same truck in an
   overlapping window is rejected with 409: *"Överlappar med 2026-08-22 11:00–14:00 —
   redigera den istället"*, or, when that entry has ended or is running while this one
   starts, *"…, som redan har slutat. Ändra tiden på den här posten."* and *"…, som pågår
   nu. Ändra tiden på den här posten."*, since #33 refuses the edit then.
5. **Cancel** sets `cancelled_at`. Nothing is deleted.
6. **Takedown on request:** a manual SQL delete of the truck **and its history**.
7. **Content:** only public facts (name, location, hours, Instagram link). No copied
   photos or logos until a truck says yes. Tell every truck it is listed.
8. **Honest freshness:** the popup says when the entry was updated (*"Uppdaterad
   08:12"*) and links to the truck's Instagram. "Stämmer fortfarande" on the admin list
   moves that time without changing the entry (#18).
9. **Only trucks with an entry today appear.** No grey markers.
10. **Demand is the bottleneck**, not supply; it needs its own acquisition plan.

**Later (Owners phase), principles only:** owners claim their listing; an owner may
override an admin entry; admin takes over again after X quiet days, with a heads-up;
the popup says *"…av admin"* vs *"…av [truck]"* (the `source` column); custom SMTP
first (Supabase's built-in email reaches only org members, 2/hour).

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind v4 · MapLibre GL + PMTiles (Cloudflare R2
at launch, the local file for development) · Supabase Postgres + Auth (cookie sessions
through `@supabase/ssr`) · `Intl` for Stockholm time · Vercel. **No** Realtime, cron,
Upstash, Mailgun or Make.com, and no Nominatim at runtime (`scripts/seed-dictionary.mjs`
queries it by hand, as a dev-only authoring tool for `SPOTS`).

## Phase map

| Phase | Builds |
|---|---|
| 5 · Schema reset (done) | Squashed baseline: `trucks`, `locations`, `users`; `btree_gist` + exclusion constraint + `CHECK (ends_at > starts_at)` + `updated_at` trigger; RLS + explicit GRANTs (no anon SELECT on `trucks`/`locations`); regenerate types; rewrite `seed.sql`, `db/trucks.ts`, `db/locations.ts` (with the history queries) and the integration tests (constraint, cancelled rows don't block, CHECK, RLS) |
| 6 · Live read path (done) | `GET /api/live` and its service; `useLocations` (polling, timer, marker diffing); the popup with freshness text and Instagram link; `fake-data.ts` and `map-types.ts` deleted; the `is_active` filter in the service; the tiles on R2; a hosted Supabase project for previews, with the hosted checks; the **first preview deploy**, with the CDN cache checked (MISS → HIT → STALE) and requests per visit counted; Node and npm in `package.json` (#139) |
| 7 · Admin (done) | Magic-link login, admin only (sign-ups off, locally and on the preview); the session and `is_admin` checks in `proxy.ts` and `withAdmin` on every admin route, with `no-store` and the `Origin` check; trucks added, edited and set inactive (no delete); phone-first location entry by known spot, recent place, map tap or GPS; edit; cancel; "Stämmer fortfarande"; overlap → 409; the morning checklist; three phone checkpoints on the preview (#224, #228, #232) |
| 8 · Launch | The history retention period, for the privacy note below (Phase 7 plan #25); the app's final name, until then **WhereIsFood** in the admin screens and "Var är maten? \| Göteborg" as the public title (#26, open decision 10); Supabase Pro (backups); a production Supabase project, new keys (Phase 6 plan #18); the tiles' custom domain on R2, and the CORS rule naming it (the bucket is Phase 6's, #7); production env, added only after checking the Ignored Build Step ("Pre-deploy automation (planned)"); security headers; Swedish privacy note; takedown procedure (one transaction: delete the truck's locations, clear or delete each `users` row pointing at it, then delete the truck; Phase 5 plan #7); tell trucks they're listed; acquisition plan; runbook (Vercel Attack Mode, usage emails); Vercel Pro + Spend Management before the first marketing push; **before the deploy**, "Pre-deploy automation (planned)": CI/CD, SAST, secret scanning, branch protection, 2FA on every account, and rotating every credential |
| later | Owners (claim flow, owner dashboard, override rules, custom SMTP); optional automation (Meta Business Discovery captions in the admin screen, a scheduler) |

## Data model (built in Phase 5)

**`trucks`:** `id`, `name` (Swedish collation), `instagram_handle` (unique),
`cuisine_type`, `description`, `is_active`, `created_at`. No `last_known_*`. Claim
columns come with the Owners phase.

**`locations`:**
- `id`, `truck_id`, `latitude`, `longitude`
- `label` text, nullable (e.g. "Heden": a known spot, a recent place, or typed; a pin
  dropped on the map may have none)
- `starts_at` **NOT NULL**, `ends_at` **NOT NULL**, `CHECK (ends_at > starts_at)`
- `cancelled_at` (nullable)
- `source`, the enum `location_source` (`'admin' | 'owner'`), default `'admin'`
- `created_by` (nullable auth user id, `on delete set null`, never selected),
  `created_at`, `updated_at` — **`updated_at` moves by a `moddatetime` trigger**; a
  bare `default now()` never changes on UPDATE, and the popup's freshness text reads it
- Overlap constraint:
  ```sql
  EXCLUDE USING gist (
    truck_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (cancelled_at IS NULL)
  ```
  A violation raises SQLSTATE `23P01`; the service (Phase 7) maps it to **409** with the
  Swedish "överlappar" message. Never auto-resolve, replace or delete.
- Rows are **never deleted**, except a takedown. "Ended" (`ends_at <= now()`) and
  "cancelled" (`cancelled_at IS NOT NULL`) are filters.

**`users`:** unchanged from the old schema as `0003` left it (`id`, `truck_id`
nullable, `is_admin` and `created_at` NOT NULL), with no owner self-UPDATE.

**Gone:** `posts`, `geocoding_cache`, the replay index (0004), the `parsing_status`
values (0005), the overlap index (0006; the constraint's GiST index replaces it), and
on `locations`: `confidence`, `parser_confidence`, `source_confidence`,
`is_negation`, `post_id`, `address_raw`, `address_geocoded`, `expires_at`.

**Migrations:** Phase 5 squashed 0001–0006 into `0001_baseline.sql` (no hosted
database existed). Its lessons stand for every later migration: an explicit `GRANT` per
table, RLS on every table, atomicity earned rather than assumed, no Realtime
publication.

**History volume:** ~22k location rows a year, far below the 500 MB free database. It
powers the checklist, "recent places" and proof of value to trucks.

## RLS and grants (built in Phase 5)

| Table | anon | authenticated | service_role |
|---|---|---|---|
| `trucks` | none | none | full DML |
| `locations` | none | none | full DML |
| `users` | none | SELECT own row (`auth.uid() = id`) | full DML |

- **No anon SELECT on `trucks` or `locations`.** History is kept, so anon access would
  publish every truck's movement history through Supabase's API.
- **No owner self-UPDATE on `users`.** An unrestricted UPDATE on one's own row allows
  `is_admin = true` self-escalation and `truck_id` hijack (both confirmed via PostgREST
  earlier). A future editable profile field gets a **column-scoped** grant that never
  covers `is_admin` or `truck_id`.
- **Revoke, then grant exactly the table.** Policies only filter rows; a role still
  needs a table `GRANT`. On the local stack (`pg_default_acl`, read 2026-10-24) a
  table `postgres` creates in `public`, as the migrations do, gets no SELECT, INSERT,
  UPDATE or DELETE for the API roles, but does give `anon`, `authenticated` and
  `service_role` TRUNCATE, REFERENCES, TRIGGER and MAINTAIN (Phase 5 plan decision
  #6); one `supabase_admin` creates gets all of them, `anon` included. So every
  migration, per table, revokes all from those three roles and then grants exactly the
  table above, **`service_role` included**, as `0001_baseline.sql` does: the result
  doesn't depend on the defaults. No `service_role` policies:
  it bypasses RLS. The rule itself is `CLAUDE.md`'s.
- All writes, `/api/live` and the admin screen's reads go through server-side routes
  (route → service → db layer; only the db layer uses `supabaseAdmin`). `/api/live` is
  built (Phase 6); the writes and admin reads were built in Phase 7.
- Unverified third-party reports say free projects need explicit GRANTs for API access
  from 2026-10-30; already covered by the rule above.

## Read path: `GET /api/live` (built in Phase 6)

What Phase 6 built, and why; the reasons are the Phase 6 plan's numbered decisions,
cited as "Phase 6 #n", and its answered open decisions. The rules are `CLAUDE.md`'s
("`/api/live`", "UI Rules").

```
Admin saves ──► POST, PATCH /api/admin/locations/… ──► Supabase   (nothing else to do)

Visitor's map ──► GET /api/live (every 60 s, and when the tab regains focus)
                       │
                   Vercel CDN (one shared copy per region, 60 s) ──miss──► function ──► Supabase
```

**Server** (`src/app/api/live/route.ts` → `getLiveMap` in `src/lib/services/live.ts`)
- An **ordinary (dynamic) route**, no route segment config; `next build` lists it as
  `ƒ` (Dynamic) (Phase 6 #17). **Not ISR**: ISR would pre-render at build time (the DB
  must be reachable during `next build`) and needs a fragile "never read the request"
  rule; the header gives the same shared copy without either (process-log row 264).
- Response header: `Cache-Control: public, s-maxage=60, stale-while-revalidate=60`.
  Vercel strips `s-maxage`/`stale-while-revalidate` before the browser **when no
  `CDN-Cache-Control` header is set**, so every poll reaches the CDN copy. Don't add
  `CDN-Cache-Control`: browsers would then cache the response themselves.
- Reads through the db layer, which uses `supabaseAdmin` (anon has no SELECT),
  selecting an **explicit column
  list, never `*`**, so `created_by` and future columns can't leak.
- `getLiveMap(now)` is the only clock read on the server, and the first service (Phase
  6 #10). It runs `listActiveTrucks()` and `findLocationsOverlapping(now, now + 26 h)`
  in parallel and **drops rows of inactive trucks** (Phase 6 #9: the db layer doesn't
  filter on `is_active`). The window is `[now, now + 26 h)`, not a day: the client keeps
  entries starting before the next Stockholm midnight, up to 25 h away on the
  fall-back day, and a response can be about 3 minutes old when last used, so 26 h is
  a superset while polls succeed; `api-live.test.ts` pins both edges and the fall-back
  day. The service has no time zone; the client's `todaysEntries` does the Stockholm
  cut.
- The body is `{ entries }`, each `LiveEntry` **built field by field**, never by
  spreading a row, so `cancelled_at`, `source`, `created_at`, `is_active`,
  `description` and any future column stay on the server (Phase 6 #11). An entry that
  fails `isLiveEntry` (an out-of-range coordinate or an `infinity` time, both of which
  the schema allows) is dropped and its location id logged, so one bad row can't
  blank the map (Phase 6 #20).
- **Errors are never cached:** a DB error goes through `withErrorHandling` → 500, which
  Vercel doesn't cache. **Never return `[]` on error**: that is a cacheable 200 and
  wipes the map for a minute.
- **No `Set-Cookie`, `Vary: Cookie`, `private` or `no-store`** on this response; any
  of them stops Vercel caching it.
- Saves trigger no purge; they show within about 3 minutes: 60 s of cache, 60 s of stale
  window and a 60 s poll (Phase 7 plan step 8's sum; #228 saw each change reach the map,
  untimed).
- Locally every request runs the function; the CDN only exists on Vercel. **Checked on
  the preview** (#187, 2026-11-02): `x-vercel-cache` went `MISS`, then `HIT` within 60
  s, then `STALE` between 60 and 120 s, and the browser sees `cache-control: public`
  only (`README.md`, "Preview deploys", has the command and its limits).

**Cache-busting:** Vercel's cache key includes the query string and isn't
configurable, so `/api/live?x=<random>` misses the cache and runs one small indexed
query. Bounded cost, accepted. Vercel's DDoS mitigation runs on all plans and blocked
traffic isn't billed; Attack Mode is the free emergency switch. A firewall rule
against query strings and a per-IP rate limit were considered and dropped (they risk
breaking the app or blocking real lunchtime users behind shared IPs). Add the
query-string rule only if junk traffic actually appears.

**Client** (`useLocations`, `createLiveLoader` in `src/lib/live-loader.ts`, the pure
helpers in `src/lib/live.ts`, `useMapLibre`; all state in hooks)
1. Fetch on load; poll every 60 s while the tab is visible; fetch straight away when it
   becomes visible again. A newer fetch supersedes an older one, and a fetch with no
   answer in 15 s counts as failed.
2. A body `isLiveResponse` rejects, a non-2xx or a failed fetch is a failure: the map
   **keeps its last good markers** (Phase 6 #16) and shows `"Kunde inte uppdatera"`,
   or `"Kunde inte hämta foodtrucks. Försöker igen…"` with none, from the first failure
   until the next good answer (open decision 6). `"Inga foodtrucks idag"` shows only
   after a good answer with no markers (open decision 7).
3. A 30 s tick moves `now`; `todaysEntries` keeps only today's entries (Stockholm date)
   that haven't ended, so an ended truck leaves the map even while polls fail.
4. **One marker per truck** (Phase 6 #12): its open entry, else its next one today.
   Two states: filled while open, outlined when it opens later today (open decision 8).
   Markers are buttons, opened by click, Enter or Space.
5. `diffMarkers`, a pure function, computes which markers to add, move or remove, and
   `useMapLibre` applies only that: the map is never fully re-rendered (Phase 6 #14).
6. The popup: the truck's name, the place (no line when `label` is null, Phase 6 #13),
   whether it is open, its hours (naming the day of a start that isn't today and of an
   end on another day than the start, Phase 6 #21), `"Uppdaterad …"` by Stockholm
   calendar days (open decision 5), and the Instagram link. Components never read the
   clock: `now` reaches the popup as a prop (Phase 6 #15).

Per poll ~10 KB (2–3 KB compressed). Each poll is one Vercel request even from cache,
and **map tiles are a bigger request consumer than polling** (see Pricing). On the
preview (#187's PR #197, Chrome's Network tab, one reload): a first visit made 16 of
the app's requests to Vercel, one of them `/api/live`; a returning visit, with the
browser cache on, 6.

**Scaling limits** (Phase 6 #22, the owner's call: known and written down, nothing
built for them now). The read path scales with visitors (one CDN copy per region),
not with trucks. In the order they would be hit:
- **1,000 rows, a hard wall.** `findLocationsOverlapping` and `listActiveTrucks` throw
  past `MAX_ROWS` rather than return part of the rows, so `/api/live` answers 500: a map
  opened then shows no markers, and one already open keeps its markers until each entry
  ends. It counts entries in the 26 h window and active trucks, not history; about 50
  trucks with one or two entries a day use a tenth of it or less. **The admin reads hit
  it sooner:** the admin list (`listAdminEntries`) reads every truck's entries for 14
  days, so it answers 500 past about 36 trucks with two entries a day, each entered two
  weeks ahead (a stated limit, PR #243); it and the trucks screen also read
  `listAllTrucks`, which counts inactive trucks too; the checklist reads one day window a
  week, then its suggestions' window, up to two days (`getChecklist`). First fix, for all
  of them: raise `max_rows` and `MAX_ROWS` together (the hosted project's too). Triggers:
  the admin list's 14 days passing ~500 rows, which comes first, or the live window
  passing ~500.
- **The whole response on every poll:** about 15 MB an hour for a visitor with the
  map open at 3,000 entries (measured on synthetic ones). Fix: fetch only the visible
  area, on a fixed grid so each cell stays one cached response.
- **HTML markers** re-position on every `move` event, so the cost grows with their
  number; where a phone starts to stutter isn't measured. Fix: a GeoJSON source with
  clustering, which changes `CLAUDE.md`'s HTML-marker rule.
- **One time zone** (`Europe/Stockholm`, `stockholm.ts`'s `TZ`, PR #238). Fix: a time
  zone per entry.
- Outside the code: one admin entering every entry by hand, a Gothenburg-only tile
  file, Swedish-only text.

## No cron

Nothing needs a scheduler: reads filter on `ends_at`, the client timer moves pins in
and out, cancellation is a column, and history is kept on purpose. Vercel Hobby only
allows daily cron jobs anyway (a more frequent schedule fails at deploy). If a job
must run with nobody's browser open (Business Discovery polling, a checklist
reminder, quiet-owner alerts), use **Supabase pg_cron** or an external service, never
Vercel's free cron.

## Admin and auth (built in Phase 7)

What Phase 7 built, and why; the reasons are the Phase 7 plan's numbered decisions, cited
as "Phase 7 #n", and its answered open decisions. The rules are `CLAUDE.md`'s
("Supabase", "proxy.ts", "API responses", "UI Rules").

- **Login.** `/admin/login` emails a magic link (`signInWithOtp` with
  `shouldCreateUser: false`), and `/auth/callback` exchanges its code and sets the
  session cookies. Public sign-ups are off under `[auth]`, never `[auth.email]`, locally
  and on the preview; the admin user is made by hand (`README.md`, "5. Create the admin
  user"). The link has to be opened in the browser that asked for it, which the login
  says (#240); an emailed 6-digit code is IS #241. A session holds until logout (open
  decision 2).
- **Cookie sessions through `@supabase/ssr`** (#12). The proxy refreshes the session and
  writes its cookies; admin routes only read them; `/auth/callback` and `POST
  /auth/logout` write their own. Logout is `signOut({ scope: 'local' })`, then deleting
  the `sb-*` cookies itself, answered with a 303 to the login (#28).
- **Three clients** (#27): `supabase.ts` (`supabaseAdmin`, server only, behind
  `server-only`), `supabase-browser.ts` (`createBrowserClient`, for Auth only) and
  `supabase-session.ts` (the cookie-session clients for the proxy, the routes, the
  `/admin` page, the callback and logout).
- **The check** (`requireAdmin`): no session cookie → reject before any network or DB
  call; then the session (`getUser`); then `users.is_admin`, read through the db layer
  (`getUserById`, #14). An Auth or database failure is "unavailable", never "logged out":
  503 `{ error }` on a route, a Swedish error on a page (#32). The proxy runs it for
  `/admin/*` and `/api/admin/*`, letting the login through; `withAdmin` runs it again
  on every admin handler (#13), sets `Cache-Control: no-store` (#15), refuses a write
  whose `Origin` isn't this origin (#16; `requestOrigin` reads the headers, because
  `next dev`'s `request.url` isn't the browser's host), and reads bodies through
  `readJson`.
- **Writes** go through API routes, route → service → db (#11); the server sets
  `created_by` and `source` (#17). An overlap (`23P01`) and a duplicate Instagram handle
  (`23505`) are 409s; handles are stored in one form, lower-case with no `@` (#29).
- **The screens** are phone-first and Swedish, with "Poster" and "Foodtrucks" in every
  header but the login's (`AdminNav`, #37). "Ställ in" and "Sätt inaktiv" ask first
  (#37); ✗ on the checklist lives in `localStorage` (#20); "Inställt idag" isn't built
  (#19). The place picker has a name field, a map on demand and five recent places
  (#35).
- **Checked on the owner's phone on the preview:** login and logout, with `/api/live`
  still cached for a logged-in admin (#224); an entry reaching the public map (#228);
  the whole walkthrough (#232, its history inserted by SQL: Phase 7 #38).

## Pre-deploy automation (planned)

Planned by the owner on 2026-10-24 (IS #176) as **one piece of work, designed together,
before the first production deploy (Phase 8)**. Until then every gate is manual
(`CLAUDE.md`, "Testing"). Nothing below exists yet unless marked **on**.

**Already on** (repository and account settings, the owner, 2026-10-24):
- **GitHub Secret Protection and push protection** on the repository, and push
  protection for the owner's account. A history scan found no secret.
- **Dependabot alerts and malware alerts**, with the dependency graph. One auto-triage
  rule is enabled, GitHub's preset "Dismiss low-impact alerts for development-scoped
  dependencies" (the owner's screenshot, 2026-10-24). Which alerts it has dismissed,
  including any on `eslint-config-next`, an exact pin in `devDependencies`, is reviewed
  when the CI is designed. The preset "Dismiss package malware alerts" is disabled.
- **Two-factor authentication** (the rule is `CLAUDE.md`'s, "Secrets"): the owner's
  GitHub account and the Cloudflare, Supabase and Vercel accounts Phase 6 created all
  use a mobile authenticator app (the owner's confirmations in PRs #194, #195 and #197,
  and for GitHub, and every method, in PR #204, 2026-11-03). Not recorded yet: the 2FA
  of each account's recovery email. No domain or registrar account exists yet.

All of these can be switched off without any change in the repo. They were checked in
the GitHub UI: the CLI token used here, though it has admin rights, gets `403` from the
secret-scanning, Dependabot-alerts and vulnerability-alerts APIs, and no
`security_and_analysis` field (probed 2026-10-24).

**To build:**
- **A pre-commit secret scan** (tool chosen then), run from a tracked hooks folder
  through `core.hooksPath`. **The same scan runs in CI**, because `--no-verify`, or a
  clone that never set `core.hooksPath`, skips a local hook. It covers what
  `.gitignore` can't: a value pasted into a tracked file, or `git add -f`.
- **GitHub Actions running the four gates** on every PR into `dev` (and into `main`, if
  one is created for production). `test:all` needs a local Supabase in the job, and the
  job needs a Node `devEngines` admits.
- **SAST.** SonarQube Cloud is the owner's preferred tool; self-hosted SonarQube would
  need a server. CodeQL, GitHub's own, is the alternative or a complement. Confirm the
  free tier for public repositories and the setup when it's built. Plus a dependency
  check in CI (e.g. `npm audit`).
- **Dependabot security updates** (automatic PRs), only once the gates run on PRs.
  `next`, `eslint-config-next` and `maplibre-gl` are exact pins upgraded deliberately,
  each with a browser check of `/map` (Phase 4 plan decision #10). A Dependabot PR is
  reviewed like any other, and the pinned packages keep their browser check. Check then
  that Dependabot's updater runs a Node `devEngines` admits: below it, npm stops with
  `EBADDEVENGINES` and no PR comes (not probed: nothing runs it yet).
- **Branch protection** on `dev` (and `main`, if created): PR required, the checks
  required, no force-push.
- **Secrets in CI runs:** a workflow that Dependabot triggers reads the Dependabot
  secrets store, not Actions secrets, and a PR from a fork reads neither. Required
  checks are set per branch, so a check that needs a token (SonarQube Cloud's, say)
  fails on those PRs and blocks them. The ways round it: a Dependabot copy of the token,
  or a job condition (`if:`) that skips the check, which GitHub reports as passing.
  **A skip means SAST didn't run on that PR**, so Phase 8 decides what covers fork PRs
  (e.g. CodeQL, which needs no token). GitHub's documented behaviour, not probed: no CI
  exists yet.

**Before the production deploy:**
- **Check every account against `CLAUDE.md`'s two-factor rule** ("Secrets"), the
  owner's GitHub included, each account's recovery email, and a registrar once there
  is one, and keep the recovery codes offline.
- **Give Production its variables only after checking that the Vercel project's
  Ignored Build Step is still set** to cancel a Production build from any branch but
  `main`. It runs when a build starts, so promoting an existing preview to Production
  doesn't pass through it: don't promote a branch preview. A CLI deploy wasn't tried,
  and its cancel case hasn't been seen (`README.md`, "Preview deploys", #187).
- **Dependabot's branches build on Vercel with the Preview variables**, the secret key
  among them, once Dependabot security updates are on: Git Fork Protection covers
  forks only. Decide then whether that is acceptable or how to stop it.
- **Rotate every credential**, in case one leaked: every key, token and secret that
  existed before the deploy, or replace it with a new project's. A new production
  Supabase project has new keys by construction. Reuse nothing from the preview setup.
  Local-stack keys aren't secrets and are out of scope. Check Supabase's rotation docs
  then: its newer and legacy API keys rotate differently.

**Not planned, an option to revisit:** a secrets manager (Doppler, Infisical, 1Password
CLI, or dotenvx-encrypted env files, which `supabase/.gitignore`'s `.env.keys` line
anticipates), if several people or environments make Vercel and GitHub secrets hard
to manage. dotenvx commits its encrypted env files, which the root `.gitignore`'s `.env*`
ignores, so adopting it means un-ignoring those files there, while `.env.keys`, its
private key, stays ignored (as `supabase/.gitignore` already has it). The ignore rule and
where secrets live meanwhile are `CLAUDE.md`'s ("Secrets").

## Pricing and upgrade triggers (researched 2026-10-10)

| Service | Plan | When | ≈ per month |
|---|---|---|---|
| Supabase | Pro | **at launch** (Free has no backups) | $25 |
| Cloudflare R2 | pay as you go | **at launch**, tiles only | $0 at launch traffic |
| Vercel | Pro + Spend Management (pause cap) | before a marketing push, at ~50% of any Hobby limit, or when commercial, whichever first | ~$20/member + capped usage |

- **The Hobby cliff is the main availability risk, from success more than attackers.**
  Hobby has 1M CDN requests a month shared by the page, chunks, polls **and tiles**,
  and going over makes the site unavailable for up to 30 days (no bill). Hobby is also
  non-commercial only. Hence tiles on R2 (row 265; already on previews, Phase 6 #7)
  and Pro before marketing.
- **R2:** 10 GB storage and 10M Class B reads a month free, egress free. ~30–60 reads
  per visit covers ~200k visits a month. At launch: a **custom domain** on Cloudflare
  DNS (not `r2.dev`) and a CORS rule whose origins are the domain and localhost, or the
  map loads blank. The bucket (Standard storage) and its CORS rule exist since Phase 6,
  on `r2.dev` with a preview pattern (`README.md`, "Get the map tiles"). Skip the
  Protomaps Worker.
- **Supabase Free:** 500 MB database, 5 GB egress, pauses after a week idle, no
  backups. Pro's spend cap is on by default. Keep preview projects in a separate free
  org, or delete them at launch.
- **On Vercel Pro, Spend Management with a pause cap is required**, or traffic not
  classified as DDoS is billed on demand.
- Vercel deprecated Node 20 on 2026-10-01. Deploys build on the major `engines.node`
  pins (Part 1, "Versions").

## Open decisions

For the plans to settle (`transition.md` §12). Phase 7 settled the checklist look-back
(Phase 7 plan #22) and the pre-filled times (#23), and moved these two to Phase 8:
1. **Retention period** for detailed location history (GDPR; #25).
2. **App name** for UI text (#26; until then the admin screens say WhereIsFood).

Deferred to the Owners phase: X-day takeover, heads-up text, owner-overrides-admin
mechanics, hand-off rule, custom SMTP provider.

## Principles and risks

- **A wrong pin costs more than a missing pin.** Freshness text, the Instagram link,
  and nothing on the map until confirmed all protect trust.
- **The admin's daily workload is the real cost of this model.** The checklist, known
  spots, recent places and pre-filled times keep it sustainable. Plan for sick days;
  the map should say honestly when it's stale.
- Stories vanish after 24 h and often hold "idag står vi vid…", so notifications must
  be on per truck. Last-minute cancellations are where relayed data goes wrong.
- **Privacy:** many trucks are sole traders, so location history can be personal data.
  It needs a stated purpose and a retention period, a takedown must delete the
  history, and the site gets a short Swedish privacy note.
- Backups: Supabase Pro at launch; before that, a manual `supabase db dump` if real
  data exists.

---

# Part 3 — Standing rules

These hold in both the current state and the target design.

**Owned by `CLAUDE.md`:** Supabase clients and keys, secrets, grants and RLS, architecture
layers, the db layer, `proxy.ts`, API responses (`withErrorHandling`, the `{ error }`
shape), the `/api/live` rules, locations, UI rules and time. This part doesn't restate
them. Part 1's "Database" and Part 2 do describe several of them (the db layer, RLS
and grants, the trigger's SQL rule, `/api/live`, the auth check order) **together with
their reasons**; where one of those statements and a `CLAUDE.md` rule disagree, the
`CLAUDE.md` rule wins and the statement is corrected. A rule restated in two files drifts (process-log rows 291, 293,
294, 295).

## Map behaviour

- Centred on Gothenburg `[11.9746, 57.7089]`, zoom 13 (MapLibre takes `[lng, lat]`).
- Coordinates are `(latitude, longitude)` everywhere else; MapLibre's order is a
  rendering concern converted at the map boundary.

## Import convention

Files **inside `src/`** import other `src/` modules via the `@/` alias (`./src/*`),
never relative paths. Files outside `src/` keep relative imports: `scripts/*.mjs` run
on plain Node, which can't resolve the alias (`copy-maplibre-worker.mjs` imports
`../src/lib/maplibre-worker.mjs`, and breaks install, dev and build if "fixed"), and
`tests/integration/*` import `./helpers`. Bare package imports stay as they are
(`maplibre-gl/dist/maplibre-gl.css`, `next/navigation`). Use `import type` for anything used only as a type; plain
`import` for runtime values.

```typescript
import type { Truck } from "@/lib/types";        // ✅ alias, type-only
import { isInGothenburg } from "@/lib/geo";      // ✅ alias, runtime value
import type { Truck } from "../lib/types";       // ❌ relative
import { Truck } from "@/lib/types";             // ❌ a type imported as a value
```

## Component structure

An example of the convention, not today's `TruckPopup` (whose props are a
`MarkerEntry` from `live.ts`, `now` and `onClose`):

```tsx
import type { Location, Truck } from "@/lib/types";

interface TruckPopupProps {
  truck: Truck;
  location: Location;
  onClose: () => void;
}

export default function TruckPopup({ truck, location, onClose }: TruckPopupProps) {
  return <div>{/* render only */}</div>;
}
```

- `export default function` for components; named exports for types and utilities.
- Props typed with a named `interface ComponentNameProps`, even with one field.
- React 19 / Next 16: `ref` is an ordinary prop; never `forwardRef`.
- `'use client'` only on the boundary component that owns hooks (e.g. `MapClient`);
  presentational children inherit the client bundle.

## Hooks

The public map: `useMapLibre.tsx` (applying the marker diff, popups; map init is
`map-setup.ts`'s, shared with the place picker's map, PR #245) and `useLocations.ts`
(polling, the 30 s tick, the fetch state; Part 2, "Read path"). The admin screens:
`useLogin`, `useAdminScreen`, `useAdminLocations` (the list),
`useLocationForm`, `usePlacePicker` with `usePickerMap` and `useGeolocation`,
`useChecklist` and `useTrucks`. The list, the form, the recent places, the checklist and
the trucks go through their uncached admin routes; `useLogin` calls Supabase Auth,
`useGeolocation` reads the browser's position, `usePickerMap` drives the picker's map and
`useAdminScreen` joins the others. What each holds is its header comment.

## Status codes

`400` bad input · `401` not authenticated · `403` authenticated but not allowed (not
admin, or a write from a foreign `Origin`) · `404` an entry or truck that doesn't exist
(or an entry already cancelled) · `409` conflict (an overlapping entry, from `23P01`; a
duplicate Instagram handle, from `23505`) · `500` unexpected · `503` Auth or the
database couldn't say whether the session is an admin's (Phase 7 plan #32).

## Decisions carried forward

Numbered decisions that outlive their phase as a rule or a task for a later phase,
carried by the end-of-phase reconciliation (the milestone-retrospective procedure's part 6, in the process log's
"How to use it"), from Phase 5's on. Earlier phases' carried decisions are cited where
they live (e.g. Phase 4 #10–#13 in `CLAUDE.md` "Dependencies"). The last column says
where each rule's text lives, so a later plan doesn't drop it as "the old plan's";
where it names two places, each holds a part of it, so a change to the rule checks
both. The first column names each row's source: "Phase N #n" a plan decision, "open
decision n" a plan's open decision, "IS #n" an issue, "PR #n round r" a check a review
round settled. A trailing "(IS #n)" or "(PR #n)" names the issue or PR that added the
decision, and any other parenthetical the part of the row that source backs.

Rows for decisions settled between phases are marked as `CLAUDE.md` "Process Log"
says.

| Decision or issue | What it settled | Where the rule lives |
|---|---|---|
| Phase 4 #14 (IS #152) | Settled decisions go in the current plan's numbered decisions; the log's old detail entries are on the `archive/process-log-details` tag | `CLAUDE.md` "Process Log"; the log's "How to use it" |
| Phase 4 #15 (IS #155) | Log rows are written with `bash scripts/process-log.sh add`; every checked value is in the log's one `values` block; Miss ≤ 600 and Fix ≤ 300 characters from row 321 | `CLAUDE.md` "Process Log"; the log's "Columns" |
| IS #149 | The pre-review claims check (`scripts/claims.sh`) and the sweep listed from the diff | `CLAUDE.md` "Review rounds" |
| IS #150, Phase 5 #22 (PR #173) | `Caught by` starts with one group: `code-review`, `self` or `user`. Every review Claude was asked to run is `code-review`, however it was done; `plan-review` is gone | the log's "Columns" (`Caught by`) and its `values` block |
| Phase 5 #20 (PR #172) | Review rounds keep `/code-review`'s default findings limit, and repeat up to the ceiling (Phase 7 #4, #39 below) | `CLAUDE.md` "Review rounds" |
| Phase 5 #5, #8, #10, #18 | The db layer's rules, and the SQL rule the `updated_at` trigger's `WHEN` needs | `CLAUDE.md` "Hard Rules" ("db layer") |
| Phase 5 #3, #23 (PR #175) | The baseline is `0001_baseline.sql`; later migrations are `0002_<name>.sql`, `0003_…`, never `npx supabase migration new`'s timestamp names | `CLAUDE.md` "Hard Rules" ("Supabase") |
| Phase 5 #24 (PR #175) | Where a decision settled between phases goes, and how the next plan and reconciliation take it up | `CLAUDE.md` "Process Log" (the one copy) |
| IS #171 (PR #173) | The sweep also lists each code pattern a fix guards; a claim is backed by a command that could show it false, and a behaviour a probe can settle is probed, not hedged | `CLAUDE.md` "Review rounds" |
| Phase 5 #4, #14 | The CHECK is part of the overlap guard (an empty range overlaps nothing), so it is never relaxed; indexes are the constraint's plus one per read, and another needs a measured query | Part 1 "Database" |
| Phase 5 #6, #7 | Revoke, then grant per table; foreign keys to `trucks` stay `NO ACTION`. **The takedown (Phase 8) is one transaction:** delete the truck's locations, clear or delete each `users` row whose `truck_id` points at it, then delete the truck | `CLAUDE.md` "Hard Rules" ("Supabase", "Locations"); Part 2's Phase map (Phase 8 row) |
| Phase 5 #12; Phase 6 #13 | `label` is nullable; a missing one leaves the popup's place line out | Part 2 "Read path" (client) |
| Phase 5 #19; PR #167 round 5 (`max_rows`) | A hosted project is checked for `sv-SE-x-icu`, both extensions in `extensions` and the Data API's Max rows before the app uses it (the preview project's passed, 2026-11-02; production's is Phase 8's) | Part 1 "Database"; `CLAUDE.md` "Hard Rules" ("db layer", Max rows) |
| Phase 5 #9, #11, #13 | Built in Phase 7: the checklist reuses `findLocationsOverlapping` with its own day windows; truck writes came with the truck screen; the Gothenburg box is checked by the location validator, never a database CHECK | Part 1 "Database" (the db layer, coordinates) |
| Phase 6 #1 (IS #176) | CI/CD (the four gates in GitHub Actions), SAST (SonarQube Cloud preferred), a pre-commit and CI secret scan, Dependabot security updates once CI runs, and branch protection are one piece of Phase 8's work, built before its production deploy | Part 2 "Pre-deploy automation (planned)"; `CLAUDE.md` "Testing" |
| Phase 6 #2 (IS #176) | The "deploy" in the 2026-09-06 decision "Gates stay manual until deploy" is the official production deploy, not a preview deploy | `CLAUDE.md` "Testing" |
| Phase 6 #3 (IS #176) | Two-factor authentication on every account that can reach the project, by passkey, hardware key or authenticator app, not SMS; set up as each account is created, checked again before the production deploy | `CLAUDE.md` Hard Rules ("Secrets", the rule); Part 2 "Pre-deploy automation (planned)" (which accounts meet it, and the pre-deploy check) |
| Phase 6 #4 (IS #176) | Every credential that existed before the production deploy is rotated, or replaced by a new project's, before it | Part 2 "Pre-deploy automation (planned)" (the pre-deploy rotation). `CLAUDE.md`'s rotation rule ("Secrets") is another one, for a secret that reached a commit |
| Phase 6 #5 (IS #176) | Hosted secrets for deploys and CI live in Vercel environment variables, GitHub Actions and Dependabot secrets; developers' own copies stay on their machine; none in a tracked or shared file | `CLAUDE.md` Hard Rules ("Secrets") |
| Phase 6 #6 (IS #178) | `next.config.ts` sets `experimental.agentUpgrade: false`, so an agent-run build or dev server doesn't fail, or query the advisory source, when an advisory covers the installed Next; advisories come through Dependabot alerts and `npm audit` | `CLAUDE.md` "Dependencies"; the comment in `next.config.ts` |
| Phase 6 #7 | The tiles are on Cloudflare R2 for every deploy, pulled forward from Phase 8; development keeps the local file; Phase 8 moves the bucket to a custom domain | Part 1 "Map tiles"; Part 2's Phase map (Phase 8 row) and "Pricing" |
| Phase 6 #9, #10, #11, #17, #20 | The read path's server: the `is_active` filter in the service, the first service, entries built field by field, no segment config on the route, a row failing `isLiveEntry` dropped | Part 2 "Read path" (server); `CLAUDE.md` "`/api/live`" (no segment config, the column list) |
| Phase 6 #12, #14, #15, #16, #21; open decisions 5–8 | The map's behaviour: one marker per truck, a pure marker diff, the clock only in hooks, a failed poll keeping the last good markers with a notice, the popup's hours and freshness text, the empty state, two marker states | `CLAUDE.md` "UI Rules" (#12, #16, open decision 5); Part 2 "Read path" (client) |
| Phase 6 #18 | The preview database is a separate, disposable free project, with preview keys only; production gets a new project in Phase 8 | Part 2's Phase map (Phase 8 row); "Pricing" ("Supabase Free") |
| Phase 6 #22 | The read path's scaling limits are known and written down, with their fixes and the first trigger; nothing is built for them yet | Part 2 "Read path" ("Scaling limits") |
| Phase 6 #23 (PR #201) | The Phase 6 retrospective's calls: `scripts/sweep.sh` (IS #200); the review-row level and limit rule retired (from row 422 a review row records neither, and a count may have been cut by the default limit); no action on row 325's repeats | `CLAUDE.md` "Review rounds"; the log's "Columns" ("What one row is") |
| Phase 6 #24 | Dependabot alert #7 (`minimatch` before 11.0.1, dev only) dismissed; revisit if `npm audit --omit=dev` lists it or a lint run takes glob patterns from outside the repo | Part 1 "Versions" |
| Phase 6 open decisions 1, 3, 4, 9, 10, 11 | The preview setup: the bucket's `r2.dev` URL, the newer Supabase keys in the old variable names, Stockholm for both regions, `onFail: "error"` and `engines.node: "26.x"`, the CORS pattern, Deployment Protection with a bypass secret | `README.md` "Get the map tiles", "Hosted preview database", "Preview deploys"; `CLAUDE.md` "Dependencies" (open decision 9) |
| IS #200 (PR #202) | Each review round's sweep runs `scripts/sweep.sh`, whose hits are a floor, not the list; `claims.sh` lists the probe words; both read the diff through `scripts/lib/diff.sh` | `CLAUDE.md` "Review rounds"; the scripts' headers |
| IS #170 (PR #174) | Schema guards get negative controls in `tests/controls/`, run by `node scripts/controls.mjs` | `CLAUDE.md` "Testing"; `.claude/commands/create-issues.md` "Failure modes" |
| Phase 7 #1 (IS #205) | What a review fix may add, and what becomes a stated limit or an issue instead. Measure: fix-added code's share of the findings after round 1 (20.1% in rows 441–542, from 18.8% in #203; the Phase 7 retrospective) | `CLAUDE.md` "Review rounds" ("Applying a finding") |
| Phase 7 #2 (IS #205) | The order for a false or too-broad claim: cut first, reword last. Measure: new imprecision's share after round 1 (12.8% in rows 441–542, from 22.1%) | `CLAUDE.md` "Review rounds" ("Applying a finding"; the claims check points to it) |
| Phase 7 #4, #39 (IS #207, #260) | The review round ceiling: full, scoped, full, then stop, with one scoped round on the fixes when the last full round finds a defect in what runs. Measures: PRs past the ceiling (2 of 20 in rows 441–542) and rows with `Escaped` `merged` (3 in 441–542); neither should rise. Neither sees a defect a dropped round would have found | `CLAUDE.md` "Review rounds" ("The round itself") |
| Phase 7 #5 (IS #207) | The final records check, and rounds skipping the records. Measure: records findings (2 of 560 named in rows 441–542, from 54 of 498) and record errors found after merge (2: rows 453, 537); each PR body gives the count of errors the final pass found | `CLAUDE.md` "Review rounds" ("The final records check") |
| Phase 7 #6 (IS #207) | A fix changing what the owner approved goes back to the owner. Measure: log rows recording such a change made without asking (1 in Phase 7, row 513) | `CLAUDE.md` "Review rounds" ("Applying a finding") |
| Phase 7 #7 (IS #209) | The reconciliation also brings `README.md`'s status parts in line. Measure: reconciliation review findings on them (row 432; judged in IS #234's PR) | the process log's "How to use it", part 6 |
| Phase 7 #8 (IS #209) | While a plan is current, stale hits in `project-context.md` or the README's status parts wait for the reconciliation, named in the plan's reconciliation step. Measure: unordered edits by other PRs (0 in Phase 7) | `CLAUDE.md` "Review rounds" (the sweep's step 3) and "Doc changes"; the process log's "How to use it", part 6 |
| Phase 7 #9 (IS #211) | New text, like a sweep hit, points to where a rule or fact lives instead of restating it. Measure: restated copies' share after round 1 (6.4% in rows 450–542, from 9.8%) | `CLAUDE.md` "Review rounds" (the sweep's step 3) |
| Phase 7 #39 (IS #233, PR #261) | The Phase 7 retrospective's calls: #1, #2 and #5–#9 kept, #4's ceiling adjusted; #3's re-run of #203's classification done (it doesn't outlive the phase); the Phase 6 retrospective's actions unchanged; no new action | the process log's Phase 7 retrospective; the Phase 7 rows above |
| Phase 7 #10, #11, #13, #14, #15, #16, #32 | The admin API is under `/api/admin/*`, writes go through API routes, `withAdmin` wraps every admin handler (the test finds them on disk), `is_admin` is read through the db layer, admin answers carry `no-store`, a write from a foreign `Origin` is refused, and an Auth or database failure is 503, not "logged out" | `CLAUDE.md` "proxy.ts" and "API responses"; Part 2 "Admin and auth" |
| Phase 7 #12, #27, #28 | Cookie sessions through `@supabase/ssr`; `supabase.ts` stays the server-only module beside `supabase-browser.ts` and `supabase-session.ts`; logout sits beside the callback, signs out locally, deletes the `sb-*` cookies and answers 303 | `CLAUDE.md` "Supabase"; Part 2 "Admin and auth" |
| Phase 7 #17, #18, #19, #20, #33; open decision 9 | The server sets `created_by` and `source`; "Stämmer fortfarande" moves `updated_at` with no migration; "Inställt idag" isn't built; ✓ is an ordinary create and ✗ writes nothing to the database; an entry that has ended can't be saved or edited | Part 2 "Product model" and "Admin and auth" |
| Phase 7 #22, #23, #24, #30, #34, #35; open decision 8 | The checklist's 4-week look-back at the most recent matching day, with no "Alla stämmer" button for now; the 11–13 pre-fill, kept after 13:00; the date field; an end at or before the start is the next day; the place picker | Part 2 "Product model" |
| Phase 7 #29 | Instagram handles are stored lower-case, with no `@`, matching `^[a-z0-9._]{1,30}$` | Part 2 "Admin and auth"; `src/lib/validators/truck.ts` |
| Phase 7 #31 | Stockholm days come from `stockholm.ts`'s whole-day arithmetic, never `now - 7 × 24 h` | `CLAUDE.md` "Time" (added by IS #234) |
| Phase 7 #36 | An issue's browser checks run locally at phone width; the phone on `dev`'s preview is for checkpoints | `CLAUDE.md` "Testing" |
| Phase 7 #37 | "Poster" and "Foodtrucks" in every admin header but the login's; a question before "Sätt inaktiv" | Part 2 "Admin and auth" |
| Phase 7 #25, #26; open decision 10 | History retention and the app's final name are Phase 8's; until then the admin screens say WhereIsFood and the public title stays | Part 2 "Phase map" (Phase 8 row) and "Open decisions" |
| Phase 7 open decisions 1–5 | The login is a magic link (a 6-digit code is IS #241); a session lasts until logout; a phone gets past Deployment Protection by logging in to Vercel; the preview's Redirect URLs are `dev`'s alias alone, no wildcard; the admin user is made by hand | `README.md` "Hosted preview database" (the Redirect URLs) and "5. Create the admin user"; Part 2 "Admin and auth" (the link, the session); this row (a phone's Vercel login) |
