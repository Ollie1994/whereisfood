# Foodtruck Map Gothenburg — Project Context

> **This document has been wrong before.** When a rule here turns out to be stale,
> incorrect, or is followed and causes a defect, fix it *and* append a row to
> `.claude/process-log.md` — see the "Process Log" section in `CLAUDE.md` for the
> triggers. That file is how we find out which parts of this one keep failing;
> `project-context` and `CLAUDE.md` are both already named in it.

**How to read this file.** It was rewritten at the end of Phase 4 (#127) and
reconciled at the end of Phase 5 (#165). It has three parts:

1. **Current state** — what exists on `dev` after Phase 5. Trust it for "what is the
   code doing today".
2. **Target design** — what Phases 5–8 build, condensed from `.claude/transition.md`
   (now history). Trust it for "what are we building", never as a description of the
   code. The sections marked "built in Phase 5" are the exception for what they say
   about the **schema** (Part 1's "Database" says it matches them); what they say about
   services, routes and the 409 mapping is still target design.
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
| 6 | Live read path (first preview deploy) | next; no plan yet |
| 7 | Admin | not started |
| 8 | Launch (first production deploy) | not started |
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

# Part 1 — Current state (after Phase 5)

## What runs

- `/` redirects to `/map`. `/map` renders MapLibre over a local PMTiles file with
  Swedish labels (`@protomaps/basemaps`, `lang: "sv"`), centred on Gothenburg.
- Markers and popups come from **fake data** (`src/lib/fake-data.ts`), typed by the
  frozen `src/lib/map-types.ts`. The app reads nothing from the database and has **no
  API routes**: the schema and db layer below are called only by the integration
  tests.
- The fake-data map still behaves like the **old** design: marker colour from
  `confidence` (green ≥ 0.9, yellow ≥ 0.45; grey, drawn at `last_known_*`, for a truck
  whose location is missing, below 0.45 or a negation; **no marker at all** when
  `last_known_*` is null), and popup labels from the same colours. Phase 6 replaces this;
  don't change it before then (Phase 4 plan, Out of Scope).
- `src/proxy.ts` is a no-op stub. Its matcher (`/dashboard/:path*`, `/admin/:path*`,
  `/api/locations`) is a Phase 1 draft; Phase 7 sets the real one.

## Map tiles

`public/*.pmtiles` is gitignored, so a fresh clone has no tiles and the map draws an
empty background. The README ("Get the map tiles") gives the command: `pmtiles
extract` from a recent Protomaps daily build (dates listed at
`maps.protomaps.com/builds`; its "download" link is the whole ~139 GB planet), with
the bounding box from `src/lib/geo.ts`. `NEXT_PUBLIC_PMTILES_URL=/gothenburg.pmtiles`.

MapLibre's worker is copied from `node_modules` into the gitignored
`public/maplibre/<version>/` by `scripts/copy-maplibre-worker.mjs`, run as the
`postinstall`, `predev` and `prebuild` hooks. MapLibre's documented
`setWorkerUrl(new URL(…, import.meta.url))` form 404s under Next 16.3's Turbopack, with
every gate green (Phase 4 plan decision #13, process-log row 282).

## Versions

| Package | Version | Note |
|---|---|---|
| `next`, `eslint-config-next` | 16.3.8 | exact pins; upgrade together |
| `react`, `react-dom` | 19.2.4 | |
| `maplibre-gl` | 6.11.2 | exact pin |
| `@protomaps/basemaps` | ^5.7.2 | replaced the deprecated `protomaps-themes-base` |
| `pmtiles` | ^4.5.0 | |
| `@supabase/supabase-js` | ^2.106 | |
| `date-fns-tz` (+ `date-fns`, its peer) | ^3.2 / ^4.3 | |
| `vitest` | ^4.1.11 | pulls in `vite` 8 |
| `supabase` CLI | ^2.109 | dev dependency |

Toolchain: Node `^20.19.0 || >=22.12.0` and **npm ≥ 11** (npm 10.9.2 crashes on
vitest 4's optional peers). Both are prose only; enforcing them in `package.json` waits
for Vercel's build versions (#139, Phase 6). `npm audit --omit=dev` is clean; full
`npm audit` shows one accepted dev-only chain (`braces` via `eslint-config-next`,
GHSA-vfj7-8cjw-p6xm). `next.config.ts` sets `agentRules: false` (Phase 4 plan decision #12).

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
  which the constraint needs: an empty range overlaps nothing (#4).
- The `locations_updated_at` trigger (`moddatetime`, #5). Its `WHEN` skips every
  UPDATE that clears `created_by`: it exists for the one an auth user's deletion runs
  through `created_by … on delete set null`, but it can't tell that one from an edit
  (the SQL rule for that is `CLAUDE.md`'s, "db layer").
  `btree_gist` and `moddatetime` both live in the `extensions` schema.
- Two partial btrees, one per read; the constraint's GiST index serves overlap checks
  (#14).
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
- Coordinates are `float8` with no CHECK; the Gothenburg box is Phase 7's validator
  (#13).
- `supabase/seed.sql`: three fixed-UUID trucks (Vintervilan inactive, with no rows)
  and four weeks of 11:00–14:00 Stockholm history ending yesterday, plus one row
  spanning `now()`, all relative to the reset (#15).

`src/lib/database.types.ts` is generated from it, **in Git Bash** (PowerShell 5.1's
`>` re-encodes the file): `npx supabase gen types typescript --local >
src/lib/database.types.ts`. `src/lib/types.ts` derives `Truck`, `Location` (without
`created_by`), `NewLocation` and `LocationPatch` from it with no narrowing by hand.

**The db layer** (`src/lib/db/`):
- `trucks.ts`: `getActiveTruckById`, `listActiveTrucks`. No truck writes yet: they
  come with Phase 7's truck screen (#11).
- `locations.ts`: `insertLocation`, `updateLocation`, `cancelLocation`,
  `findLocationsOverlapping`, `listRecentLocationsForTruck`. No delete.
  `findLocationsOverlapping(from, to)` serves both Phase 6's live window and Phase 7's
  checklist (#9), and **doesn't filter on `is_active`** (the plan's open decision 6:
  Phase 6 decides where that filter goes).
- `complete.ts`: `MAX_ROWS` (pinned to `config.toml`'s `max_rows` by its unit test)
  and `assertAllRows`, which list reads without a `limit` use to throw when `max_rows`
  cuts them.

Its rules are `CLAUDE.md`'s ("db layer" under Hard Rules); the plan's "Functions and
types" section has each function's contract.

**Checked only on the local stack.** Phase 6's hosted project must check:
- that `sv-SE-x-icu` exists (#19): without it the `create table` fails, `42704`;
- that both extensions install into `extensions` and the trigger form is accepted
  (#5, the plan's open decision 2);
- that the Data API's `max_rows` is at least `MAX_ROWS`. It is set in the dashboard,
  not from `config.toml`. Below `MAX_ROWS`, a `listRecentLocationsForTruck` call whose
  `limit` is above the hosted cap, on a truck with more matching rows than the cap,
  would return a cut result with no error (PR #167 round 5); the two other list reads
  would throw through `assertAllRows` on any result above the cap.

## Modules kept on purpose

| Module | What it is | Used again in |
|---|---|---|
| `src/lib/http/handler.ts` | `withErrorHandling()`, the route error wrapper (+ test) | Phase 6 (`/api/live`), Phase 7 |
| `src/lib/geo.ts` | `GOTHENBURG_BBOX` and `isInGothenburg()` (+ test) | Phase 7: validate map taps and GPS |
| `src/lib/spots.ts` | `SPOTS`: known Gothenburg places with coordinates (+ test) | Phase 7: "known spot" entry |
| `src/lib/validators/uuid.ts` | UUID check (+ test) | Phase 7: truck id on admin writes |
| `src/lib/db/trucks.ts`, `locations.ts`, `complete.ts` | the db layer on the Phase 5 schema (see "Database") | Phase 6 (`/api/live`), Phase 7 |
| `src/lib/supabase.ts` | `supabaseAdmin` and `supabaseClient` | Phase 6/7 (see "Admin and auth") |
| `src/lib/database.types.ts` | generated from the baseline (see "Database") | regenerated with each migration |
| `src/lib/types.ts` | row types **derived** from the generated ones, no narrowing by hand (`source` is an enum, Phase 5 plan #18) | Phase 6, Phase 7 |
| `src/lib/map-types.ts` | the fake-data map's **frozen, hand-written** types: the old `Truck` and `Location` shapes (`MapTruck`, `MapLocation`), `MarkerColor`, `MarkerState`. Imports nothing, so the schema can't change it (Phase 5 plan #1) | deleted in Phase 6 |
| `src/lib/fake-data.ts` | the map's data source | replaced in Phase 6 |
| `src/lib/maplibre-worker.mjs` | worker folder and file list (+ test) | — |
| `scripts/seed-dictionary.mjs` | prints `Spot` stubs from OpenStreetMap for **human review**; never paste its output over `SPOTS`, which reverts hand-corrected pins | when adding spots |
| `scripts/test-all.mjs` | the `test:all` gate | — |
| `scripts/controls.mjs`, `tests/controls/*.sql` | the schema's negative controls; not a gate | when `CLAUDE.md` "Testing" says |
| `scripts/claims.sh` | the pre-review claims check (`CLAUDE.md`, "Review rounds") | every review round |
| `scripts/process-log.sh` | `add` and `check` for the process log (`CLAUDE.md`, "Process Log") | every log row |

## Folder structure

Today's tree (tracked files; generated folders omitted). Expected additions are marked
with the phase that adds them; each phase plan decides the exact files.

```
src/
├── app/
│   ├── layout.tsx, globals.css, favicon.ico
│   ├── page.tsx                  ← redirects to /map
│   ├── map/page.tsx
│   ├── api/live/route.ts         ← Phase 6
│   ├── api/… (admin routes)      ← Phase 7
│   └── admin/…                   ← Phase 7
├── components/Map/               ← MapClient, MapView, TruckPopup
├── hooks/
│   ├── useMapLibre.tsx
│   └── useLocations.ts           ← Phase 6
├── lib/
│   ├── db/                       ← trucks.ts, locations.ts, complete.ts (+ test)
│   ├── services/                 ← Phase 7 (doesn't exist yet): a small locations service
│   ├── http/handler.ts           ← withErrorHandling (+ test)
│   ├── validators/uuid.ts        ← (+ test)
│   ├── geo.ts, spots.ts          ← (+ tests)
│   ├── supabase.ts, types.ts, database.types.ts
│   ├── map-types.ts, fake-data.ts ← deleted and replaced in Phase 6
│   └── maplibre-worker.mjs       ← (+ test)
└── proxy.ts                      ← stub until Phase 7
scripts/                          ← copy-maplibre-worker.mjs, seed-dictionary.mjs, test-all.mjs,
                                    controls.mjs, claims.sh, process-log.sh
supabase/                         ← config.toml, migrations/0001_baseline.sql, seed.sql
tests/integration/                ← setup.ts, helpers.ts (+ test), schema, rls, db-trucks and
                                    db-locations tests
tests/controls/                   ← one .sql per negative control, run by controls.mjs
public/                           ← gothenburg.pmtiles and maplibre/ (both gitignored)
.claude/                          ← plans, context, commands, process-log.md, transition.md
```

## Environment

`.env.example` lists four variables: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only, never
`NEXT_PUBLIC_`) and `NEXT_PUBLIC_PMTILES_URL`. The map needs only the last one. The
Supabase three are needed by the integration tests; `npx supabase status -o env`
prints them under other names: `API_URL` → `NEXT_PUBLIC_SUPABASE_URL`, `ANON_KEY` →
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SERVICE_ROLE_KEY` → `SUPABASE_SERVICE_ROLE_KEY`.

## Tests and gates

Vitest with two projects, `unit` and `integration` (local Supabase, files run
sequentially). The integration project has five test files: `schema` (constraint,
CHECK, NOT NULL, enum, trigger, foreign keys, the unique Instagram handle), `rls` (grants and the one policy, with signed-in
auth-user fixtures), `db-trucks`, `db-locations` and `helpers`. There is no CI; the four
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
2. **Morning checklist from history.** No schedules table: the admin screen lists what
   each truck did on the same weekday recently (*"Förra tisdagen: Truck A, Heden
   11–14"*). ✓ creates today's entry with the same place and times; ✗ ignores it.
   **Nothing reaches the map until it is confirmed.**
3. **Fast entry.** A pin by map tap, a known spot (`SPOTS`), a recent place (from
   history) or GPS ("Jag är här nu"). Start and end times are pre-filled and always
   required. A normal update takes under ~10 seconds.
4. **Overlaps are refused, not resolved.** A second entry for the same truck in an
   overlapping window is rejected: *"Överlappar med 11–14 — redigera den istället"*.
5. **Cancel** sets `cancelled_at`. Nothing is deleted.
6. **Takedown on request:** a manual SQL delete of the truck **and its history**.
7. **Content:** only public facts (name, location, hours, Instagram link). No copied
   photos or logos until a truck says yes. Tell every truck it is listed.
8. **Honest freshness:** the popup says when the entry was updated (*"Uppdaterad
   08:12"*) and links to the truck's Instagram.
9. **Only trucks with an entry today appear.** No grey markers.
10. **Demand is the bottleneck**, not supply; it needs its own acquisition plan.

**Later (Owners phase), principles only:** owners claim their listing; an owner may
override an admin entry; admin takes over again after X quiet days, with a heads-up;
the popup says *"…av admin"* vs *"…av [truck]"* (the `source` column); custom SMTP
first (Supabase's built-in email reaches only org members, 2/hour).

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind v4 · MapLibre GL + PMTiles (Cloudflare
R2 at launch, the local file for development) · Supabase Postgres + Auth ·
date-fns-tz · Vercel. **No** Realtime, cron, Upstash, Mailgun or Make.com, and no
Nominatim at runtime (`scripts/seed-dictionary.mjs` queries it by hand, as a dev-only
authoring tool for `SPOTS`).

## Phase map

| Phase | Builds |
|---|---|
| 5 · Schema reset (done) | Squashed baseline: `trucks`, `locations`, `users`; `btree_gist` + exclusion constraint + `CHECK (ends_at > starts_at)` + `updated_at` trigger; RLS + explicit GRANTs (no anon SELECT on `trucks`/`locations`); regenerate types; rewrite `seed.sql`, `db/trucks.ts`, `db/locations.ts` (with the history queries) and the integration tests (constraint, cancelled rows don't block, CHECK, RLS) |
| 6 · Live read path | `GET /api/live`; `useLocations` (polling, timer, marker diffing); popup with freshness text and Instagram link; replace `fake-data.ts` and delete `map-types.ts`; decide where the `is_active` filter goes (Phase 5 plan, open decision 6); the popup's text for a NULL `label` (Phase 5 plan decision #12); a hosted Supabase project for previews, with the hosted checks Part 1's "Database" lists; **first preview deploy**: check `x-vercel-cache` MISS → HIT → STALE, measure real requests per visit in Vercel's usage dashboard, record Vercel's build Node/npm (#139) |
| 7 · Admin | Magic-link login, admin only (public sign-ups disabled); session and `is_admin` checks in `proxy.ts` **and** every admin route; truck CRUD; mobile-first location entry; edit; cancel; overlap → 409; the morning checklist |
| 8 · Launch | Supabase Pro (backups); tiles on R2 (custom domain, CORS); production env; security headers; Swedish privacy note; takedown procedure (one transaction: delete the truck's locations, clear or delete each `users` row pointing at it, then delete the truck; Phase 5 plan #7); tell trucks they're listed; acquisition plan; runbook (Vercel Attack Mode, usage emails); Vercel Pro + Spend Management before the first marketing push |
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

**`users`:** as today (`id`, `truck_id` nullable, `is_admin`, `created_at`), with no
owner self-UPDATE.

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
- (Target, Phases 6–7: no route exists yet.) All writes, `/api/live` and the admin screen's reads go through server-side routes
  (route → service → db layer; only the db layer uses `supabaseAdmin`).
- Unverified third-party reports say free projects need explicit GRANTs for API access
  from 2026-10-30; already covered by the rule above.

## Read path: `GET /api/live` (Phase 6)

```
Admin saves ──► POST/PATCH /api/locations ──► Supabase   (nothing else to do)

Visitor's map ──► GET /api/live (every 60 s, and when the tab regains focus)
                       │
                   Vercel CDN (one shared copy per region, 60 s) ──miss──► function ──► Supabase
```

**Server**
- An **ordinary (dynamic) route**, no route segment config. **Not ISR**: ISR would
  pre-render at build time (the DB must be reachable during `next build`) and needs a
  fragile "never read the request" rule; the header gives the same shared copy without
  either (process-log row 264).
- Response header: `Cache-Control: public, s-maxage=60, stale-while-revalidate=60`.
  Vercel strips `s-maxage`/`stale-while-revalidate` before the browser **when no
  `CDN-Cache-Control` header is set**, so every poll reaches the CDN copy. Don't add
  `CDN-Cache-Control`: browsers would then cache the response themselves.
- Reads through the db layer, which uses `supabaseAdmin` (anon has no SELECT),
  selecting an **explicit column
  list, never `*`**, so `created_by` and future columns can't leak.
- Returns active trucks plus locations with `cancelled_at IS NULL AND ends_at > now()
  AND starts_at < now() + interval '1 day'`. The client handles minute-level edges.
  The db layer has both halves: `listActiveTrucks()` and
  `findLocationsOverlapping(now, now + 1 day)`, which returns every truck's rows,
  inactive ones included, so Phase 6 decides where the `is_active` filter goes.
- **Errors are never cached:** a DB error goes through `withErrorHandling` → 500, which
  Vercel doesn't cache. **Never return `[]` on error**: that is a cacheable 200 and
  wipes the map for a minute.
- **No `Set-Cookie`, `Vary: Cookie`, `private` or `no-store`** on this response; any
  of them stops Vercel caching it.
- Saves trigger no purge; they show within ~1–2 minutes (cache + stale window + poll).
- Locally every request runs the function; the CDN only exists on Vercel.

**Cache-busting:** Vercel's cache key includes the query string and isn't
configurable, so `/api/live?x=<random>` misses the cache and runs one small indexed
query. Bounded cost, accepted. Vercel's DDoS mitigation runs on all plans and blocked
traffic isn't billed; Attack Mode is the free emergency switch. A firewall rule
against query strings and a per-IP rate limit were considered and dropped (they risk
breaking the app or blocking real lunchtime users behind shared IPs). Add the
query-string rule only if junk traffic actually appears.

**Client (`useLocations`, all state in hooks)**
1. Fetch on load.
2. Poll every 60 s; fetch straight away on `visibilitychange`; pause while hidden.
3. Update only the markers that changed. Never fully re-render the map.
4. A 30 s timer moves pins to "öppet nu" (`starts_at` passed) or removes them
   (`ends_at` passed), showing only entries for today (Stockholm date).
5. Re-check all markers when the page becomes visible (background tabs throttle
   timers).

Per poll ~10 KB (2–3 KB compressed). Each poll is one Vercel request even from cache,
and **map tiles are a bigger request consumer than polling** (see Pricing).

## No cron

Nothing needs a scheduler: reads filter on `ends_at`, the client timer moves pins in
and out, cancellation is a column, and history is kept on purpose. Vercel Hobby only
allows daily cron jobs anyway (a more frequent schedule fails at deploy). If a job
must run with nobody's browser open (Business Discovery polling, a checklist
reminder, quiet-owner alerts), use **Supabase pg_cron** or an external service, never
Vercel's free cron.

## Admin and auth (Phase 7)

- **"Logged in" is not "admin".** `supabase/config.toml` has `enable_signup = true`,
  so anyone can get a session. Disable public sign-ups (locally and in the hosted
  project) and create the admin user by hand.
- Check `users.is_admin`, not just a session, in the proxy **and again in every admin
  route or service**. The proxy is a first filter, not the only check.
- **Order:** no session cookie → reject before any network or DB call; then verify the
  session; then `is_admin`. A cookie-less flood costs only the function run.
- Integration test: a non-admin session gets 401/403 on every write route.
- The admin screen reads through its own uncached admin routes, so the admin sees
  their own edits at once.
- ⚠ **`src/lib/supabase.ts` throws at import when a variable is missing**, and
  `SUPABASE_SERVICE_ROLE_KEY` is undefined in the browser. The first client component
  that imports `supabaseClient` (the login screen) would evaluate the whole module in
  the browser and throw. Split it then: `supabaseAdmin` in a server-only module
  (`import 'server-only'`), `supabaseClient` in a browser-safe one. A single
  `server-only` guard on the shared file would also block the legitimate anon import.
  The browser needs the anon client only for Auth.
- Admin UI is **mobile-first**: design and test at phone width.

## Pricing and upgrade triggers (researched 2026-10-10)

| Service | Plan | When | ≈ per month |
|---|---|---|---|
| Supabase | Pro | **at launch** (Free has no backups) | $25 |
| Cloudflare R2 | pay as you go | **at launch**, tiles only | $0 at launch traffic |
| Vercel | Pro + Spend Management (pause cap) | before a marketing push, at ~50% of any Hobby limit, or when commercial, whichever first | ~$20/member + capped usage |

- **The Hobby cliff is the main availability risk, from success more than attackers.**
  Hobby has 1M CDN requests a month shared by the page, chunks, polls **and tiles**,
  and going over makes the site unavailable for up to 30 days (no bill). Hobby is also
  non-commercial only. Hence tiles on R2 at launch (row 265) and Pro before marketing.
- **R2:** 10 GB storage and 10M Class B reads a month free, egress free. ~30–60 reads
  per visit covers ~200k visits a month. Use a **custom domain** on Cloudflare DNS (not
  `r2.dev`) and a CORS rule (origins = the domain + localhost; `GET`/`HEAD`; headers
  `range`/`if-match`; expose `etag`), or the map loads blank. Skip the Protomaps
  Worker. Use Standard storage, not Infrequent Access.
- **Supabase Free:** 500 MB database, 5 GB egress, pauses after a week idle, no
  backups. Pro's spend cap is on by default. Keep preview projects in a separate free
  org, or delete them at launch.
- **On Vercel Pro, Spend Management with a pause cap is required**, or traffic not
  classified as DDoS is billed on demand.
- Vercel deprecated Node 20 on 2026-10-01 (still listed, alongside 22 and 24); plan
  deploys on 22 or 24 (#139).

## Open decisions

For the plans to settle (`transition.md` §12):
1. **Retention period** for detailed location history (GDPR).
2. **Checklist look-back:** last week's same weekday, or the last 2–4 weeks?
3. **Default times** pre-filled in the entry form (e.g. 11–14, or per truck from
   history).
4. **App name** for UI text.

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

**Owned by `CLAUDE.md`:** Supabase clients and keys, grants and RLS, architecture
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

An example of the convention, not today's `TruckPopup` (which types its props from the
frozen `map-types.ts` until Phase 6):

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

Today: `useMapLibre.tsx` (map init, markers, popups). Target: `useLocations` (Phase 6,
polling and timer as in Part 2). Further hooks (e.g. a selected-truck or filter hook)
are decided when built.

## Status codes

`400` bad input · `401` not authenticated · `403` authenticated but not allowed (e.g.
not admin) · `409` conflict (an overlapping entry, from `23P01`) · `500` unexpected.

## Decisions carried forward

Numbered decisions that outlive their phase as a rule or a task for a later phase,
carried by the end-of-phase reconciliation (the milestone-retrospective procedure's part 6, in the process log's
"How to use it"), from Phase 5's on. Earlier phases' carried decisions are cited where
they live (e.g. Phase 4 #10–#13 in `CLAUDE.md` "Dependencies"). The last column says
where each rule's text lives, so a later plan doesn't drop it as "the old plan's";
where it names two places, each holds a part of it, so a change to the rule checks
both. Plan decisions are "Phase N #n"; issues are "IS #n".

Between phases, a newly settled decision is added as a row whose first cell starts
"**between phases**", with its date and issue (`CLAUDE.md`, "Process Log"); the next
plan numbers each such row, and that plan's reconciliation replaces the marker with
the plan decision. None are marked today.

| Decision or issue | What it settled | Where the rule lives |
|---|---|---|
| Phase 4 #14 (IS #152) | Settled decisions go in the current plan's numbered decisions; the log's old detail entries are on the `archive/process-log-details` tag | `CLAUDE.md` "Process Log"; the log's "How to use it" |
| Phase 4 #15 (IS #155) | Log rows are written with `bash scripts/process-log.sh add`; every checked value is in the log's one `values` block; Miss ≤ 600 and Fix ≤ 300 characters from row 321 | `CLAUDE.md` "Process Log"; the log's "Columns" |
| IS #149 | The pre-review claims check (`scripts/claims.sh`) and the sweep listed from the diff | `CLAUDE.md` "Review rounds" |
| IS #150, Phase 5 #22 (PR #173) | `Caught by` starts with one group: `code-review`, `self` or `user`. Every review Claude was asked to run is `code-review`, however it was done; `plan-review` is gone | the log's "Columns" (`Caught by`) and its `values` block |
| Phase 5 #20 (PR #172) | Review rounds keep `/code-review`'s default findings limit; a row records the round's level and limit | `CLAUDE.md` "Review rounds"; the log's "Columns" |
| Phase 5 #5, #8, #10, #18 | The db layer's rules, and the SQL rule the `updated_at` trigger's `WHEN` needs | `CLAUDE.md` "Hard Rules" ("db layer") |
| Phase 5 #3, #23 (PR #175) | The baseline is `0001_baseline.sql`; later migrations are `0002_<name>.sql`, `0003_…`, never `npx supabase migration new`'s timestamp names | `CLAUDE.md` "Hard Rules" ("Supabase") |
| Phase 5 #24 (PR #175) | Between phases, with no current plan, a settled decision goes in this table as a row marked "between phases", through an issue and PR (a rule also into `CLAUDE.md` at once); the next plan numbers it, and its reconciliation replaces the marker and sets `CLAUDE.md`'s plan pointer to none | `CLAUDE.md` "Process Log"; the log's "How to use it", part 6; `/create-milestone`'s Output Format |
| Phase 5 #6, #7 | Revoke, then grant per table; foreign keys to `trucks` stay `NO ACTION`. **The takedown (Phase 8) is one transaction:** delete the truck's locations, clear or delete each `users` row whose `truck_id` points at it, then delete the truck | `CLAUDE.md` "Hard Rules" ("Supabase", "Locations"); Part 2's Phase map (Phase 8 row) |
| Phase 5 #12 | `label` is nullable; the popup's text for a missing one is Phase 6's | Part 2's Phase map (Phase 6 row) |
| Phase 5 #1, #19; open decisions 2, 6 | Phase 6 tasks: delete `map-types.ts`; check `sv-SE-x-icu`, both extensions and `max_rows` on the hosted project; decide where the `is_active` filter goes | Part 1 "Database" (hosted checks); Part 2's Phase map (Phase 6 row) |
| Phase 5 #9, #11, #13 | Phase 7 tasks: the checklist reuses `findLocationsOverlapping` with its own window; truck writes come with the truck screen; the Gothenburg box is checked by the validator, never a database CHECK | Part 1 "Database" (the db layer, coordinates) |
| IS #170 (PR #174) | Schema guards get negative controls in `tests/controls/`, run by `node scripts/controls.mjs` | `CLAUDE.md` "Testing"; `.claude/commands/create-issues.md` "Failure modes" |
