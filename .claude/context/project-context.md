# Foodtruck Map Gothenburg — Project Context

> **This document has been wrong before.** When a rule here turns out to be stale,
> incorrect, or is followed and causes a defect, fix it *and* append a row to
> `.claude/process-log.md` — see the "Process Log" section in `CLAUDE.md` for the
> triggers. That file is how we find out which parts of this one keep failing;
> `project-context` and `CLAUDE.md` are both already named in it.

**How to read this file.** It was rewritten at the end of Phase 4 (#127), not
reconciled, and has three parts:

1. **Current state** — what exists on `dev` after Phase 4. Trust it for "what is the
   code doing today".
2. **Target design** — what Phases 5–8 build, condensed from `.claude/transition.md`
   (now history). Trust it for "what are we building", never as a description of the
   code.
3. **Standing rules** — conventions that hold in both.

The current phase plan wins over this file. This file is reconciled with reality at
the end of each phase; between those points the plan carries what was settled.

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
| 2 | Ingestion: email and webhook lanes | done; removed in Phase 4 (schema kept until Phase 5) |
| 3 | Parser: Swedish caption parser | stopped; removed in Phase 4 |
| 4 | Housekeeping: remove the old design, upgrade dependencies, rewrite the docs | finishing |
| 5 | Schema reset | not started |
| 6 | Live read path (first preview deploy) | not started |
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

# Part 1 — Current state (after Phase 4)

## What runs

- `/` redirects to `/map`. `/map` renders MapLibre over a local PMTiles file with
  Swedish labels (`@protomaps/basemaps`, `lang: "sv"`), centred on Gothenburg.
- Markers and popups come from **fake data** (`src/lib/fake-data.ts`). The app reads
  nothing from the database and has **no API routes**.
- The fake-data map still behaves like the **old** design: marker colour from
  `confidence` (green ≥ 0.9, yellow ≥ 0.45; grey, drawn at `last_known_*`, for a truck
  whose location is missing, below 0.45 or a negation), and popup labels from the same
  colours. Phase 6 replaces this;
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

## Database (the old schema, kept until Phase 5)

Migrations `0001`–`0006` still describe the old design, and stay until Phase 5
replaces them with a squashed baseline:

- Five tables: `trucks` (with `last_known_latitude/longitude`), `posts`, `locations`
  (with `confidence`, `parser_confidence`, `source_confidence`, `is_negation`,
  `post_id`, `address_*`, `expires_at`, and a **nullable** `ends_at`),
  `geocoding_cache`, `users`.
- RLS is enabled on all five. Grants: `service_role` gets one blanket `grant … on all
  tables in schema public` (it covers only tables that existed at that point); `anon`
  and `authenticated` get SELECT on `trucks` and `locations` (the target design removes
  this); `authenticated` gets SELECT on `users` and no UPDATE (no owner self-UPDATE).
- `0004` is the email replay index, `0005` adds `parsing_status = 'duplicate'`, `0006`
  reshapes the overlap index. All three go in Phase 5.
- `supabase/seed.sql` seeds dev trucks against these columns.

`src/lib/database.types.ts`, `src/lib/db/locations.ts`, `src/lib/db/trucks.ts` and
`tests/integration/*` match this schema, so they keep its vocabulary until Phase 5
replaces schema, types, db layer and tests together. Don't "fix" them toward the
target design before that.

## Modules kept on purpose

| Module | What it is | Used again in |
|---|---|---|
| `src/lib/http/handler.ts` | `withErrorHandling()`, the route error wrapper (+ test) | Phase 6 (`/api/live`), Phase 7 |
| `src/lib/geo.ts` | `GOTHENBURG_BBOX` and `isInGothenburg()` (+ test) | Phase 7: validate map taps and GPS |
| `src/lib/spots.ts` | `SPOTS`: known Gothenburg places with coordinates (+ test) | Phase 7: "known spot" entry |
| `src/lib/validators/uuid.ts` | UUID check (+ test) | Phase 7: truck id on admin writes |
| `src/lib/db/trucks.ts`, `src/lib/db/locations.ts` | primitives on the old schema | rewritten in Phase 5 |
| `src/lib/supabase.ts` | `supabaseAdmin` and `supabaseClient` | Phase 6/7 (see "Admin and auth") |
| `src/lib/database.types.ts` | generated (`npx supabase gen types typescript --local`) | regenerated in Phase 5 |
| `src/lib/types.ts` | hand-written row types **derived** from the generated ones, with CHECK columns narrowed by hand (e.g. `source`) | re-derived **and its narrowings edited by hand** in Phase 5 |
| `src/lib/fake-data.ts` | the map's data source | replaced in Phase 6 |
| `src/lib/maplibre-worker.mjs` | worker folder and file list (+ test) | — |
| `scripts/seed-dictionary.mjs` | prints `Spot` stubs from OpenStreetMap for **human review**; never paste its output over `SPOTS`, which reverts hand-corrected pins | when adding spots |
| `scripts/test-all.mjs` | the `test:all` gate | — |

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
│   ├── db/                       ← trucks.ts, locations.ts (rewritten in Phase 5)
│   ├── services/                 ← empty today; a small locations service in Phase 7
│   ├── http/handler.ts           ← withErrorHandling (+ test)
│   ├── validators/uuid.ts        ← (+ test)
│   ├── geo.ts, spots.ts          ← (+ tests)
│   ├── supabase.ts, types.ts, database.types.ts
│   ├── fake-data.ts              ← replaced in Phase 6
│   └── maplibre-worker.mjs       ← (+ test)
└── proxy.ts                      ← stub until Phase 7
scripts/                          ← copy-maplibre-worker.mjs, seed-dictionary.mjs, test-all.mjs
supabase/                         ← config.toml, migrations/0001–0006 (squashed in Phase 5), seed.sql
tests/integration/                ← setup.ts, helpers.ts (+ test), db-locations.test.ts
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
sequentially). There is no CI; the four gates are run by hand: `npx tsc --noEmit`,
`npm run lint`, `npm run test:all`, `npm run build`. Details, and what the gates can't
see, are in `CLAUDE.md` "Testing". Green gates don't show the map renders: look at
`/map` in a browser after any map, dependency or tile change.

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
date-fns-tz · Vercel. **No** Realtime, cron, Upstash, Nominatim, Mailgun or Make.com.

## Phase map

| Phase | Builds |
|---|---|
| 5 · Schema reset | Squashed baseline: `trucks`, `locations`, `users`; `btree_gist` + exclusion constraint + `CHECK (ends_at > starts_at)` + `updated_at` trigger; RLS + explicit GRANTs (no anon SELECT on `trucks`/`locations`); regenerate types; rewrite `seed.sql`, `db/trucks.ts`, `db/locations.ts` (with the history queries) and the integration tests (constraint, cancelled rows don't block, CHECK, RLS) |
| 6 · Live read path | `GET /api/live`; `useLocations` (polling, timer, marker diffing); popup with freshness text and Instagram link; replace `fake-data.ts`; a hosted Supabase project for previews; **first preview deploy**: check `x-vercel-cache` MISS → HIT → STALE, measure real requests per visit in Vercel's usage dashboard, record Vercel's build Node/npm (#139) |
| 7 · Admin | Magic-link login, admin only (public sign-ups disabled); session and `is_admin` checks in `proxy.ts` **and** every admin route; truck CRUD; mobile-first location entry; edit; cancel; overlap → 409; the morning checklist |
| 8 · Launch | Supabase Pro (backups); tiles on R2 (custom domain, CORS); production env; security headers; Swedish privacy note; takedown procedure; tell trucks they're listed; acquisition plan; runbook (Vercel Attack Mode, usage emails); Vercel Pro + Spend Management before the first marketing push |
| later | Owners (claim flow, owner dashboard, override rules, custom SMTP); optional automation (Meta Business Discovery captions in the admin screen, a scheduler) |

## Data model (Phase 5)

**`trucks`:** `id`, `name`, `instagram_handle`, `cuisine_type`, `description`,
`is_active`, `created_at`. No `last_known_*`. Claim columns come with the Owners phase.

**`locations`:**
- `id`, `truck_id`, `latitude`, `longitude`
- `label` text (e.g. "Heden": a known spot, a recent place, or typed)
- `starts_at` **NOT NULL**, `ends_at` **NOT NULL**, `CHECK (ends_at > starts_at)`
- `cancelled_at` (nullable)
- `source` `'admin' | 'owner'`, default `'admin'`
- `created_by` (user id), `created_at`, `updated_at` — **`updated_at` needs a
  trigger** (e.g. `moddatetime`); a bare `default now()` never changes on UPDATE, and
  the popup's freshness text reads it
- Overlap constraint:
  ```sql
  EXCLUDE USING gist (
    truck_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (cancelled_at IS NULL)
  ```
  A violation raises SQLSTATE `23P01`; the service maps it to **409** with the
  Swedish "överlappar" message. Never auto-resolve, replace or delete.
- Rows are **never deleted**, except a takedown. "Ended" (`ends_at <= now()`) and
  "cancelled" (`cancelled_at IS NOT NULL`) are filters.

**`users`:** as today (`id`, `truck_id` nullable, `is_admin`, `created_at`), with no
owner self-UPDATE.

**Gone:** `posts`, `geocoding_cache`, the replay index (0004), the `parsing_status`
values (0005), the overlap index (0006; the constraint's GiST index replaces it), and
on `locations`: `confidence`, `parser_confidence`, `source_confidence`,
`is_negation`, `post_id`, `address_raw`, `address_geocoded`, `expires_at`.

**Migrations:** squash 0001–0006 into a fresh baseline (no production database
exists). Keep the lessons: an explicit `GRANT` per table, RLS on every table,
atomicity earned rather than assumed, no Realtime publication.

**History volume:** ~22k location rows a year, far below the 500 MB free database. It
powers the checklist, "recent places" and proof of value to trucks.

## RLS and grants (Phase 5)

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
- **Explicit GRANTs.** Policies only filter rows; a role still needs a table `GRANT`,
  and Supabase doesn't auto-expose new tables to the API roles. Every migration grants
  explicitly, **per table, `service_role` included**, to match the table above. 0001's
  blanket `grant … on all tables` doesn't reach tables created later, so don't copy it.
- All writes, `/api/live` and the admin screen's reads go through server-side routes
  using `supabaseAdmin`.
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
- Reads with `supabaseAdmin` (anon has no SELECT), selecting an **explicit column
  list, never `*`**, so `created_by` and future columns can't leak.
- Returns active trucks plus locations with `cancelled_at IS NULL AND ends_at > now()
  AND starts_at < now() + interval '1 day'`. The client handles minute-level edges.
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

**Owned by `CLAUDE.md`, not repeated here:** Supabase clients and keys, architecture
layers, `proxy.ts`, API responses (`withErrorHandling`, the `{ error }` shape), the
`/api/live` rules, UI rules and time. One copy per rule: a rule restated in two files
drifts (process-log rows 291, 293, 294). This part holds only what `CLAUDE.md` doesn't.

## Map behaviour

- Centred on Gothenburg `[11.9746, 57.7089]`, zoom 13 (MapLibre takes `[lng, lat]`).
- Coordinates are `(latitude, longitude)` everywhere else; MapLibre's order is a
  rendering concern converted at the map boundary.

## Import convention

Internal modules are imported via the `@/` alias (`./src/*`), never relative paths.
Bare package imports stay as they are (`maplibre-gl/dist/maplibre-gl.css`,
`next/navigation`). Use `import type` for anything used only as a type; plain
`import` for runtime values.

```typescript
import type { Truck } from "@/lib/types";        // ✅ alias, type-only
import { isInGothenburg } from "@/lib/geo";      // ✅ alias, runtime value
import type { Truck } from "../lib/types";       // ❌ relative
import { Truck } from "@/lib/types";             // ❌ a type imported as a value
```

## Component structure

Components are pure render; `useState`/`useEffect` live in hooks.

```tsx
import type { MarkerState } from "@/lib/types";

interface TruckPopupProps {
  marker: MarkerState;
  onClose: () => void;
}

export default function TruckPopup({ marker, onClose }: TruckPopupProps) {
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
