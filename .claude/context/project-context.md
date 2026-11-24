# Foodtruck Map Gothenburg — Project Context

> **This document has been wrong before.** When a rule here turns out to be stale,
> incorrect, or is followed and causes a defect, fix it *and* append a row to
> `.claude/process-log.md` — see the "Process Log" section in `CLAUDE.md` for the
> triggers. That file is how we find out which parts of this one keep failing;
> `project-context` and `CLAUDE.md` are both already named in it.

**How to read this file.** It was rewritten at the end of Phase 4 (#127) and
reconciled at the end of Phases 5 (#165), 6 (#189), 7 (#234), 8 (#302), 9 (#394) and 10
(#467). It
has three parts:

1. **Current state** — what exists on `dev` and in production after Phase 10. Trust it for "what is
   the code doing today".
2. **Target design** — the design from Phase 5 on, the Owners phase's principles
   included, condensed from `.claude/transition.md` (now history). Trust it for "what
   are we building", never as a description of the code. The exceptions are the
   sections marked "built in Phase 5", for what they say about the **schema** (Part 1's
   "Database" says it matches them), "Read path", marked "built in Phase 6", "Admin
   and auth", marked "built in Phases 7 and 9", "Pre-deploy automation"'s "Built in
   Phase 8", and the Product model's launch items where they cite a Phase 7 plan decision.
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
| 8 | CI/CD | done |
| 9 | Security | done |
| 10 | Launch (first production deploy, a soft launch) | done |
| 11 | Full launch | next; no plan yet |
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

# Part 1 — Current state (after Phase 10)

## What runs

- **The soft launch** (Phase 10 plan #2, #5): `/` redirects everyone to `/om`, the Swedish
  page about Väm, and `/karta` shows the map only to the admin at `aal2`, sending everyone else
  to `/om` (`CLAUDE.md`, "The soft-launch gate"; its removal list is `src/app/karta/page.tsx`'s
  header, for Phase 11). `/integritet` is the privacy note (Phase 10 plan #8). The public pages
  share a header and footer (`src/components/PublicShell.tsx`, IS #483), and the paths are
  Swedish (Phase 10 plan #12, IS #478): the old `/about` and `/map` answer 404.
- `/karta` renders MapLibre over PMTiles with Swedish labels
  (`@protomaps/basemaps`, `lang: "sv"`), centred on Gothenburg: a local file in development,
  Cloudflare R2 on a deploy ("Map tiles"). Without WebGL2 it shows a Swedish message in
  place of the map (IS #246), and an error while `/karta` renders or in its effects (its
  start, a marker update) shows a Swedish error page, `src/app/karta/error.tsx`, whose header
  names what it doesn't catch (IS #306). A path no page matches gets a Swedish 404
  (`src/app/not-found.tsx`), and an error that `/karta`'s and `/admin`'s own error pages don't
  catch, one in the admin layout included (seen on a full load; a client-side navigation
  into `/admin` wasn't checked), a Swedish error page (`src/app/error.tsx`); one in the root
  layout, or while that page renders, reaches Next's built-in screen (no `global-error.tsx`;
  `CLAUDE.md`, "Security headers"). Each error page focuses its heading or message for a
  screen reader, and each error and 404 page has its own title (IS #413, #438).
- **Markers come from `GET /api/live`**, the one public API route: route → `getLiveMap`
  (`src/lib/services/live.ts`) → the db layer. Part 2's "Read path" (built in Phase 6)
  describes it, server and client: the markers, the popup, polling and failure.
- **Production** (Phase 10) runs on Vercel at `vararmaten.vercel.app`, built from `main`, against
  its own Supabase Free project, with the tiles on R2. `SETUP.md`'s "Production" is the one
  description of that setup, and `RUNBOOK.md` of operating it and the preview: the daily routine
  (logging in, the checklist, the entries, the trucks), the weekly routine
  (a data-only dump of `public`, then `supabase/manual/retention.sql`, the usage look and the
  request inboxes), the yearly upkeep (the
  domains, the map tiles), requests and takedowns, incidents, a marker check on the preview, a
  migration's push, and a release (`dev` into `main` by a PR, then `main` synced back into
  `dev`). Production runs `main`,
  which trails `dev`: on 2026-11-23 it was at PR #503, before IS #511's `/integritet` text (DM
  requests, the list of trucks told and the do-not-list), which a release ships before the first
  truck is told (`RUNBOOK.md`, "Telling a new truck"; IS #517). On 2026-11-23 it held the admin and
  no trucks (IS #499 finds them). The name is Väm (IS #452).
- **A preview deploy** runs on Vercel against a hosted Supabase preview project, with
  the tiles on R2. `SETUP.md`'s "Preview deploys" and "Hosted preview database" are
  the one description of that setup.
- **The admin screens** (Phases 7 and 9), Swedish and phone-first: `/admin/login` (an
  emailed magic link), `/admin/mfa` (the TOTP enroll the first time, then a code from the
  authenticator app; Phase 9), `/admin` ("Poster": the morning checklist, the entry form
  with its place picker, and the list of entries from today for 14 days, each with
  "Stämmer fortfarande", "Ställ in" and "Ändra" until it ends) and `/admin/trucks`
  ("Foodtrucks": add, edit, set inactive or active), with `/admin`'s own 404 and error
  pages. Part 2's "Admin and auth" (built in Phases 7 and 9) describes them.
- **The admin API** is under `/api/admin/`: `trucks`, `trucks/[id]`, `locations`,
  `locations/[id]`, `locations/[id]/cancel`, `locations/[id]/confirm`, `places` and
  `checklist`, every handler inside `withAdmin`. `/auth/callback` and `POST
  /auth/logout` sit outside it (Phase 7 plan #28).
- `src/proxy.ts` checks the session cookie, `is_admin` and `aal2` for `/admin/:path*` and
  `/api/admin/:path*`, letting `/admin/login` through and an `aal1` admin session to
  `/admin/mfa` alone (`CLAUDE.md`, "proxy.ts"), and gives every `/admin` page a nonce CSP.
- **Security headers** (Phase 9): every path gets `next.config.ts`'s static headers, and
  every path but `/admin` and `/admin/…` a static CSP; `src/lib/http/csp.ts` holds both CSPs (`CLAUDE.md`,
  "Security headers").
- **CI** (Phase 8): GitHub Actions runs `.github/workflows/ci.yml` on every PR into `dev` or
  `main`, and `codeql.yml` on those PRs and on pushes to both. Each branch's ruleset requires
  a list of their checks by name, CodeQL's included on both since IS #461 (`CLAUDE.md`,
  "Testing"). Dependabot opens PRs for GitHub Actions updates and npm security fixes (Part
  2, "Pre-deploy automation").

## Map tiles

`public/*.pmtiles` is gitignored, so a fresh clone has no tiles and the map draws an
empty background. `SETUP.md` ("Get the map tiles") gives the command: `pmtiles
extract` from a recent Protomaps daily build, with the bounding box from
`src/lib/geo.ts`. Development uses the local file,
`NEXT_PUBLIC_PMTILES_URL=/gothenburg.pmtiles`.

**Deploys read an extract cut the same way, from Cloudflare R2** (Phase 6 plan decision #7: pulled forward from the
launch, so a preview tests the launch tile path). The bucket is served from its `r2.dev` URL, for
previews and production (open decision 1); Phase 11, the full launch, moves it to a custom domain
(IS #373 (Phase 11)). Its CORS rule admits `http://localhost:3000`, a pattern for this project's
Vercel preview URLs (open decision 10) and production's `https://vararmaten.vercel.app` (IS #459);
the project's `whereisfood-where-is-food.vercel.app` alias gets none (IS #506), a call asked again
at the full launch. What that rule admits and doesn't, and how to check the bucket, is `SETUP.md`'s
"Map tiles on R2", the one description.

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
| `vitest` | ^4.1.12 | pulls in `vite` 8 |
| `supabase` CLI | ^2.109 | dev dependency |

Toolchain: `package.json`'s `devEngines` admits Node `26.x` and npm `>=11.0.0`, with
`onFail: "error"`, and `engines.node` is `26.x`, the major Vercel builds with (#139,
#199; Phase 6 plan open decision 9). Vercel's preview build ran Node 26.13.0 and npm
11.20.0. CI's setup-node resolves `26.x` from `devEngines` (Node v26.13.1 on PR #312, the
Phase 8 plan's open decision 2), so no early 26.x has been tested. Why each range, and
which npm reads `devEngines`, is `CLAUDE.md`'s ("Dependencies").

On 2026-11-03 `npm audit` reported 16 moderate findings, all from one advisory,
GHSA-g3hv-75wg-m249 (`minimatch` before 11.0.1, in dev dependencies only), and `npm
audit --omit=dev` found 0 vulnerabilities. The owner dismissed Dependabot alert #7 for
it: Phase 6 plan decision #24 lists the copies, the ranges holding them and when to
revisit. On 2026-11-16 (#299) the advisory sat in alert #8, dismissed by hand and kept so,
and `npm audit --omit=dev` again found 0. That is a dated result: CI's `audit` job now runs
it on every PR (`CLAUDE.md`, "Dependencies"). Dependabot alerts are on, but an auto-triage
rule can dismiss low-impact alerts on development dependencies ("Pre-deploy automation",
"Already on"). `next.config.ts` sets
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
- Foreign keys to `trucks` (`locations.truck_id`, `users.truck_id`) and `users.id → auth.users` are
  `NO ACTION`: deleting a truck with history fails with `23503`, so only the takedown and the weekly
  retention delete remove history (#7; Phase 10 plan #10). **The exception is
  `locations.created_by → auth.users`, `on delete set null`** (#8): deleting an auth user with no
  `users` row clears `created_by` on every row they wrote. One who has a `users` row (every admin
  and owner) can't be deleted until that row is: `users_id_fkey` refuses it, `23503`, and
  `created_by` stays (probed in a rolled-back transaction, 2026-10-24).
- RLS on all three; per table, `revoke all` from `anon`, `authenticated` and
  `service_role`, then the grants of Part 2's table (#6). The one policy is
  `users_select_own`.
- Coordinates are `float8` with no CHECK; the Gothenburg box is the location
  validator's (`src/lib/validators/location.ts`, #13).
- `supabase/seed.sql`: three fixed-UUID trucks (Vintervilan inactive, with no rows)
  and four weeks of 11:00–14:00 Stockholm history ending yesterday, plus one row
  spanning `now()`, all relative to the reset (#15). The hosted preview project loaded
  it once, so its history doesn't move with the date (`SETUP.md`, "Hosted preview
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

**Checked on the hosted preview project too** (2026-11-02, #186's PR #195; `SETUP.md` "Hosted
preview database"): `trucks.name`'s collation reads back `sv-SE-x-icu` (#19); `btree_gist` and
`moddatetime` are both in `extensions`, and the migration, trigger included, applied (#5); the API
roles' table grants in `public` are the migration's (`SETUP.md`, "Hosted preview database", gives
the query and the result), and `anon` gets `42501` on all three tables; the Data API's **Max rows**
is 1000, equal to `MAX_ROWS` (`complete.ts` holds the value read). Max rows is set in the dashboard,
not from `config.toml`, so a new hosted project is read there before the app uses it (production's
was, by `SETUP.md`'s hosted settings checklist, IS #458): below `MAX_ROWS`, a
`listRecentLocationsForTruck` call whose `limit` is above the hosted cap would return a cut result
with no error (PR #167 round 5). The rule is `CLAUDE.md`'s ("db layer").

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
| `scripts/controls.mjs`, `tests/controls/*.sql` | the schema's negative controls, which CI's required `controls` check runs: `--check` on every PR, the full set on a trigger path or a PR into `main` | `ci.yml`'s `controls`; by hand when `CLAUDE.md` "Testing" says |
| `scripts/controls-trigger.mjs` | `TRIGGERS`, `changedPaths` and `needsFullControls`: whether a PR gets the full controls (+ tests; `controls-trigger-coverage.test.mjs` guards the list, Phase 8 plan #8) | `ci.yml`'s `controls` |
| `scripts/write-env-local.mjs` | `.env.local` from `npx supabase status -o env`, failing on a missing value (+ test) | `ci.yml`'s `integration`, `build` and `controls` |
| `scripts/smoke.mjs` | the served build's smoke check (+ test) | `ci.yml`'s `build` |
| `scripts/audit-report.mjs` | run 3 of the `audit` job: a warning per advisory, a failure when it can't tell which (+ test) | `ci.yml`'s `audit` |
| `scripts/closing-keywords.mjs` | the closing-keyword check, `--lines` for a PR body, and `closingNumbers`, each reference's issue number (+ test) | `ci.yml`'s `secret-scan`; `claims.sh`; `post-body.mjs --closes` |
| `scripts/lib/header-like.mjs`, `scripts/lib/workflow-command.mjs` | a control file's header-line test; workflow-command escaping (+ test for the first) | `controls.mjs` (and `TRIGGERS` lists it); `audit-report.mjs` and `closing-keywords.mjs` |
| `scripts/claims.sh` | the pre-review claims check, and the PR body's closing references (`CLAUDE.md`, "Review rounds") | every review round |
| `scripts/sweep.sh` | lists the sweep's candidates: removed text still elsewhere, moved or nowhere; added text repeated elsewhere (`CLAUDE.md`, "Review rounds"; IS #200) | every review round |
| `scripts/lib/diff.sh` | the diff reading `claims.sh` and `sweep.sh` share: flags, `git_diff`, `rev_end`, the untracked warning | both scripts |
| `scripts/process-log.sh` | `add` and `check` for the process log (`CLAUDE.md`, "Process Log") | every log row |
| `scripts/post-body.mjs` | posts issue and PR text from a file, refusing invisible characters and the escapes GitHub rewrites, and reads it back; with `--rounds`, checks a PR body's round sections against the log; with `--closes`, required on a PR's body, refuses a closing keyword before an issue the PR doesn't close (+ test; IS #403, the Phase 9 retrospective's new action; IS #513, the Phase 10 one's) | every issue and PR body (`CLAUDE.md`, "Doc changes") |
| `scripts/tracked-text.test.mjs` | fails on a tracked file holding a character `post-body.mjs` refuses, unless `.gitattributes` marks it `-text` or the test's `ALLOWED` list admits those code points, with a reason (IS #430, #432) | the `unit` project (`CLAUDE.md`, "Testing") |
| `tests/totp.ts` | an RFC 6238 TOTP function on Node's `crypto`, for the tests' `aal2` sessions (+ test against the RFC's vectors; Phase 9 plan #9) | the integration tests (`helpers.ts`'s `aal2` fixtures; `admin-auth.test.ts`'s enroll-to-`aal2` case) |
| `tests/jwt.ts` | `unsignedJwt`, `SIGNED_IN`, `LINK` and `TOTP`: an access token with the claims a unit test that stubs Auth needs; `payloadOf`: a token's payload, read by integration tests (Phase 9) | `proxy.test.ts`, `http/admin.test.ts`, `services/admin-auth.test.ts`; `payloadOf` in `admin-auth.test.ts` and `helpers.test.ts` (integration) |

## Folder structure

Today's tree (tracked files; generated folders omitted). Each phase plan decides the
files it adds.

```
src/
├── app/
│   ├── layout.tsx, globals.css, favicon.ico, icon.svg, apple-icon.png (IS #481)
│   ├── page.tsx                  ← redirects to /om while the soft-launch gate stands
│   ├── not-found.tsx, error.tsx  ← the Swedish 404 and error page (IS #413)
│   ├── om/, integritet/          ← page.tsx each: about Väm, and the privacy note
│   ├── karta/                    ← page.tsx (the gate), error.tsx (the Swedish error page, IS
│   │                               #306), page.test.tsx, gate-markers.test.ts
│   ├── admin/                    ← layout.tsx, page.tsx (Poster), login/page.tsx, mfa/page.tsx,
│   │                               trucks/page.tsx, not-found.tsx, error.tsx,
│   │                               [...missing]/page.tsx (the /admin 404)
│   ├── api/live/route.ts         ← (+ test)
│   ├── api/admin/                ← checklist, places, trucks, trucks/[id], locations,
│   │                               locations/[id], …/[id]/cancel, …/[id]/confirm
│   └── auth/                     ← callback/route.ts, logout/route.ts (+ tests)
├── components/
│   ├── ErrorNotice.tsx           ← the root's and /admin's error page text
│   ├── PublicShell.tsx, VamLogo.tsx, ExternalLink.tsx ← the public pages' header and footer,
│   │                               Väm's logo (IS #481), an external link
│   ├── Map/                      ← MapClient, MapView, TruckPopup, styles.ts
│   └── Admin/                    ← AdminLocations, Checklist, LocationForm, PlacePicker,
│                                   PickerMap, TodayList, AdminTrucks, TruckForm, TruckList,
│                                   AdminNav, LoginForm, LogoutButton, MfaForm, MfaEnroll,
│                                   MfaCode, styles.ts
├── hooks/                        ← useMapLibre.tsx, useLocations.ts, useFocusOnMount.ts; the
│                                   admin hooks (see Part 3, "Hooks")
├── lib/
│   ├── db/                       ← trucks, locations, users, complete (+ test), pick
│   ├── services/                 ← live, locations, trucks, checklist, admin-auth,
│   │                               postgres (tests: locations, checklist, admin-auth)
│   ├── http/                     ← handler, admin (withAdmin), origin, id, entries, trucks,
│   │                               csp (tests: handler, admin, origin, csp)
│   ├── validators/               ← location, truck, uuid, body (tests: all but body)
│   ├── live.ts, live-loader.ts, stockholm.ts ← (+ tests); timestamp.ts
│   ├── admin-*.ts                ← the admin screens' helpers, and admin-api.ts's fetch
│   │                               wrapper (+ tests)
│   ├── basemap.ts, geo.ts, spots.ts, map-setup.ts ← (+ tests); map-texts.ts
│   ├── login.ts, auth-errors.ts, titles.ts ← (+ tests); mfa.ts
│   ├── paths.ts, contact.ts      ← the public pages' paths; Väm's contact and Instagram
│   ├── supabase.ts, supabase-browser.ts, supabase-session.ts, supabase-url.ts (+ test, IS #497)
│   ├── types.ts, database.types.ts
│   └── maplibre-worker.mjs       ← (+ test)
└── proxy.ts                      ← (+ test)
scripts/                          ← copy-maplibre-worker.mjs, seed-dictionary.mjs, test-all.mjs,
                                    controls.mjs, controls-trigger.mjs, write-env-local.mjs,
                                    smoke.mjs, audit-report.mjs, closing-keywords.mjs,
                                    post-body.mjs (tests: audit-report, closing-keywords,
                                    controls-trigger, post-body, smoke, write-env-local),
                                    controls-trigger-coverage.test.mjs, lint-rules.test.mjs,
                                    ci-advisor.test.mjs, tracked-text.test.mjs, claims.sh,
                                    sweep.sh, process-log.sh, lib/ (diff.sh, header-like.mjs
                                    (+ test), workflow-command.mjs)
supabase/                         ← config.toml (+ test), migrations/0001_baseline.sql, seed.sql,
                                    manual/ (takedown.sql, retention.sql: the two deletes)
tests/                            ← totp.ts (+ test), jwt.ts: the tests' TOTP and JWT helpers
tests/integration/                ← setup.ts, helpers.ts (+ test), schema, rls, db-trucks,
                                    db-locations, db-users, api-live, auth-routes,
                                    admin-auth, api-admin-trucks, api-admin-locations,
                                    api-admin-checklist, map-gate, takedown, retention
tests/controls/                   ← one .sql per negative control, run by controls.mjs
public/                           ← gothenburg.pmtiles (development; deploys read R2) and
                                    maplibre/ (both gitignored)
.claude/                          ← plans, context, commands, drafts, process-log.md,
                                    transition.md
.github/                          ← workflows/ci.yml, workflows/codeql.yml, dependabot.yml
.githooks/                        ← pre-commit, commit-msg, gitleaks-common.sh (set through
                                    core.hooksPath, by hand)
next.config.ts                    ← (+ test: which paths get which CSP, IS #387)
RUNBOOK.md                        ← operating production and the preview: the daily and weekly
                                    routines, the yearly upkeep, requests, incidents, a marker
                                    check, a migration, a release (Phase 10 plan #8, IS #519,
                                    #523, #525)
SECURITY.md, .gitleaks.toml       ← how to report a vulnerability; Gitleaks' config
.gitattributes                    ← the files marked `-text`, which tracked-text.test.mjs skips
```

## Environment

`.env.example` lists four variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` (server only, never `NEXT_PUBLIC_`) and `NEXT_PUBLIC_PMTILES_URL`. The
basemap needs only the last one; the markers (`/api/live`), the admin (its login, the proxy and its
routes) and the integration tests need the Supabase three, which `npx supabase status -o env` prints
locally under other names: `API_URL` → `NEXT_PUBLIC_SUPABASE_URL`, `ANON_KEY` →
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SERVICE_ROLE_KEY` → `SUPABASE_SERVICE_ROLE_KEY`. The Supabase URL
is the project URL alone: the three clients fail on a path (`supabase-url.ts`, IS #497, after
production's held `/rest/v1/`, row 936). Production takes all four from Vercel's Production-scoped
variables (`SETUP.md`, "Production"), and a preview from its Preview-scoped ones: the hosted
project's newer publishable and secret keys sit in the same two names (open decision 3), and the
tiles' URL is R2's. Where each value comes from, and where the owner keeps copies, is `SETUP.md`'s
("Hosted preview database", "Preview deploys"); where secrets may live is `CLAUDE.md`'s ("Secrets").

## Tests and gates

Vitest with two projects, `unit` and `integration` (local Supabase, files run sequentially). The
integration project has fifteen test files: `schema` (constraint, CHECK, NOT NULL, enum, trigger,
foreign keys, the unique Instagram handle), `rls` (grants and the one policy, with signed-in
auth-user fixtures), `db-trucks`, `db-locations`, `db-users`, `api-live` (the route against the
local stack), `auth-routes` (callback and logout), `admin-auth` (every admin route, found on disk,
answering 401 and 403 with `no-store`, Phase 7 plan #13, and an `aal1` session, a refused first
factor and the time-box, Phase 9; the 503 cases are `withAdmin`'s and `requireAdmin`'s unit tests),
`api-admin-trucks`, `api-admin-locations`, `api-admin-checklist`, `helpers`, and Phase 10's
`map-gate` (the soft-launch gate on the local stack), `takedown` and `retention` (the two manual SQL
files, run as `postgres`). The fixtures sign in through the PKCE magic link, read from Mailpit (a
password or a typed code only in the refusal tests), and reach `aal2` with `tests/totp.ts` (Phase 9
plan #9, #14). The `unit` project also holds `supabase/config.test.ts`, which pins Phase 9's Auth
settings in `config.toml`, and `next.config.test.ts`, which checks which paths get which CSP. CI's
run on `bb7757e` (PR #515, 2026-11-23) ran 50 unit files (1400 tests) and 15 integration files (293
tests), and that day `npm run lint` reported no warnings locally. **CI is the gate** (Phase 8, IS
#297): on each PR into `dev` or `main`, GitHub Actions runs the four gates and the other checks, and
each branch's ruleset requires its list of them. `CLAUDE.md` "Testing" has the lists, what they
don't cover, the local fast loop and the schema controls, which CI's `controls` check runs. Green
checks don't show the map renders: look at `/karta` in a browser after any map, dependency or tile
change, signed in as the admin while the gate stands (`CLAUDE.md`, "The soft-launch gate").

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
   be saved or edited (#33), nor cancelled or confirmed (Phase 9 plan #8). A normal update
   should take under ~10 seconds: Phase 7's walkthrough timed 14 to 38 s with both times
   changed, recorded as neither passed nor failed (#232; IS #256).
4. **Overlaps are refused, not resolved.** A second entry for the same truck in an
   overlapping window is rejected with 409: *"Överlappar med 2026-08-22 11:00–14:00 —
   redigera den istället"*, or, when that entry has ended or is running while this one
   starts, *"…, som redan har slutat. Ändra tiden på den här posten."* and *"…, som pågår
   nu. Ändra tiden på den här posten."*, since #33 refuses the edit then. Under a checklist
   ✓, which has no time to change, that last sentence reads *"Lägg in en annan tid med
   formuläret."* (the owner's wording, IS #274).
5. **Cancel** sets `cancelled_at`, and deletes nothing.
6. **Takedown on request:** a manual SQL delete of the truck **and its history**.
7. **Content:** only public facts (name, location, hours, Instagram link). No copied
   photos or logos until a truck says yes. Tell every truck it is listed, just before it is
   entered (`RUNBOOK.md`, "Telling a new truck"; Phase 10 plan open decision 13).
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
| 8 · CI/CD (done) | `ci.yml` on every PR into `dev` and `main` (a read-only token, actions pinned to SHAs, no path filter): the four gates (`typecheck-lint`; `unit`; `integration`, with a local Supabase and Supabase's security advisor; `build`, with a smoke check of the served build), `audit` (`npm audit`, three runs, Phase 8 plan #12), `controls` (`--check`, the full set on a trigger path or a PR into `main`), `process-log`, `secret-scan` (Gitleaks on the PR's commits and messages, and the closing-keyword check, IS #368) and `base`; `codeql.yml` (CodeQL, on PRs and on push); the Gitleaks hooks; lint rules against HTML sinks and string-built filters, each with a fixture test; rulesets on `dev` and `main` (a PR, the checks by name, up to date, no bypass, no force-push or deletion), CodeQL's checks required on `dev`, and on `main` since IS #461 (Phase 10 plan #9) (#11, #14); Dependabot (Actions version updates and npm security updates), its branches and the probes' cancelled by the Ignored Build Step, and the secret key scoped to `dev` (#15); `SECURITY.md` and private vulnerability reporting; the review of the alerts auto-triage dismissed (#299). SonarQube Cloud was dropped: its Free plan has no custom quality gate (#295); #349's re-scan before production found nothing to fix, and the project and account were then deleted (2026-11-22). Each check required by #298 was seen red on a probe PR the rules blocked; `base (main)`, added after (IS #356), only by its absence keeping one blocked (#359). Built before Phase 10's production deploy (Phase 6 plan #1) |
| 9 · Security (done) | The scope draft's "Phase 9 · Security" (IS #278 (Phase 9), Phase 9 plan #1) and the soft launch's inputs (IS #373 (Phase 9), #2), as built: TOTP MFA after the magic link, the link the only first factor (`requireAdmin`'s `amr` allowlist of `magiclink`; IS #241's emailed code waits for custom SMTP or Pro, #14), one factor per user (#13), `aal2` read from a token Auth verified (#11); a 12-hour time-box from the first factor's sign-in, until Pro's timeouts in Phase 11 (#4), and logout ending every session (#5); secure password change with its email and the admin keeping a long random password (IS #378); the factor-enrolled and factor-unenrolled emails (IS #381); length limits on free text (IS #379, #400); cancel and confirm refusing an ended entry (#8); the login-abuse settings (a 10-digit, 15-minute emailed code, the rate limits kept; the email-budget lockout accepted for Phase 9, open decision 1); security headers, a static CSP outside `/admin` and a nonce CSP on it, asserted by the smoke check (IS #387, #414); the cookie's reach to `/map` (now `/karta`) and `users_select_own` under `aal1` accepted as limits (#6, #7); one ZAP baseline scan (IS #388); the free plans' alerts and log retentions read, Auth's audit log written to the preview's database (open decision 7); the `x-forwarded-host` probe (`origin.ts`); the 2FA audit (IS #391); the hosted-settings checklist, now in `SETUP.md` (#10, IS #390); Swedish 404 and error pages (IS #413, #438); the phone checkpoint on `dev`'s preview (IS #392) |
| 10 · Launch (done) | **The first production deploy, a soft launch** (Phase 10 plan #1, #2; IS #278 (Phase 10), IS #373 (Phase 10)), on Supabase Free, `vararmaten.vercel.app` and `r2.dev`. The name Väm, with `vararmaten.se` and `varärmaten.se` bought for Phase 11 (open decision 1, IS #452); the public paths Swedish, `/om`, `/karta` and `/integritet` (#12, IS #478), behind a shared header and footer (IS #483), and Väm's temporary logo (IS #481). The soft-launch gate: `/` to `/om`, `/karta` only for the admin at `aal2`, in the page alone (Plan A, #6, IS #448 and #451's probes), each site marked and listed in `karta/page.tsx`'s header with a marker test (#5, IS #450). The privacy note `/integritet` (#8, IS #456), with the removal contact `vararmaten@proton.me` (open decision 4) and Instagram DMs (IS #511). `supabase/manual/takedown.sql` (one statement: the truck's locations deleted, each `users` row pointing at it cleared, then the truck; IS #453) and its takedown log; `retention.sql`, 52 weeks after a location ends and 30 days of Auth's audit log, run weekly (#10, open decisions 2, 3, IS #454); the weekly data-only dump of `public`, the newest 4 kept, with a restore test on the local stack (#11, open decisions 5, 11, IS #455). `RUNBOOK.md` (#8, IS #457): the weekly routine (the dump, the retention run, a look at the usage pages and 5xx logs in place of alerts, open decision 7), Attack Mode, evidence export, a takeover, a lost phone (open decision 9), a login link that doesn't come (the email-budget lockout accepted again, #3, open decision 6, IS #458, #507), a leaked key, takedown and other requests, telling a new truck (open decision 13, IS #465, #511), a private vulnerability (#13, IS #347), a paused project (open decision 8), a restore, and a release (`dev` into `main`, then the sync back; IS #462, #500). Production: its Supabase project with new keys, Phase 5 #19's hosted check and the hosted-settings checklist (IS #458), Vercel's variables and R2's CORS origin (IS #459; the alias gets none, IS #506), the first merge into `main` with CodeQL then required there (#9, IS #461), two-factor checked again on every account and every earlier credential rotated, replaced or disabled, but those open decision 12 keeps with a reason (IS #460), the deploy and the admin's TOTP (IS #463), the URL guard after production's held a path (IS #497), and the production checks (IS #464). #349's SonarQube Cloud re-scan. Telling the trucks counted 0 by the phase's end, production holding none (IS #465, #499) |
| 11 · Full launch | When the coverage target holds (IS #373 (Phase 11)): the gate removed by the removal list in `src/app/karta/page.tsx`'s header, with Phase 10 plan #5's removal checks, and the smoke check restored; the alias's CORS call (IS #506) asked again; a second message to each truck told, saying the map is open (IS #511); Supabase Pro (backups), with session timeouts; the tiles' custom domain on R2, its CORS rule keeping the app's origins, the domain in the CSP too, and, if the app gets its own domain, Vercel's domain, that domain added to R2's CORS rule, Supabase Auth's Site and Redirect URLs, and HSTS; the acquisition plan; Vercel Pro + Spend Management before the first marketing push |
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
- Rows are **never deleted**, except by a takedown and by the weekly retention delete, which
  deletes those that ended more than 52 weeks ago (`supabase/manual/retention.sql`, Phase 10
  plan #10). Until then "ended" (`ends_at <= now()`) and "cancelled" (`cancelled_at IS NOT
  NULL`) are filters.

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

**History volume:** ~22k location rows a year, kept 52 weeks after each ends, far below the
500 MB free database. It
powers the checklist, "recent places" and proof of value to trucks.

## RLS and grants (built in Phase 5)

| Table | anon | authenticated | service_role |
|---|---|---|---|
| `trucks` | none | none | full DML |
| `locations` | none | none | full DML |
| `users` | none | SELECT own row (`auth.uid() = id`) | full DML |

- **No anon SELECT on `trucks` or `locations`.** History is kept for 52 weeks after each entry
  ends, so anon access would publish every truck's movement history through Supabase's API.
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
  only (`SETUP.md`, "Preview deploys", has the command and its limits).

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
and out, cancellation is a column, and history is kept on purpose, for 52 weeks, with the
weekly retention delete run by hand after the dump (pg_cron weighed and not taken, Phase 10
plan #10). Vercel Hobby only
allows daily cron jobs anyway (a more frequent schedule fails at deploy). If a job
must run with nobody's browser open (Business Discovery polling, a checklist
reminder, quiet-owner alerts), use **Supabase pg_cron** or an external service, never
Vercel's free cron.

## Admin and auth (built in Phases 7 and 9)

What Phases 7 and 9 built, and why. The reasons are the two plans' numbered decisions,
cited as "Phase 7 #n" and "Phase 9 #n", and their answered open decisions, named with their
phase; issues are cited as "IS #n". The rules are `CLAUDE.md`'s ("Supabase", "proxy.ts",
"Security headers", "API responses", "UI Rules").

- **Login.** `/admin/login` emails a magic link (`signInWithOtp` with
  `shouldCreateUser: false`), and `/auth/callback` exchanges its code, sets the session
  cookies and lands on `/admin/mfa`: the TOTP enroll while the admin has no verified factor,
  then a code from the authenticator app (Phase 9 #14, Phase 9 open decision 5). Public
  sign-ups are off under `[auth]`, never `[auth.email]`, locally and on the preview; the
  admin user is made by hand, with a long random password (`SETUP.md`, "5. Create the
  admin user"). The link has to be opened in the browser that asked for it, which the login
  says (IS #240). The magic link is the only first factor for Phase 9: IS #241's emailed
  code waits for custom SMTP or Pro, whichever comes first, since the built-in email's
  template can't be edited without custom SMTP (Phase 9 #14). The emailed code Auth still
  issues is 10 digits and lives 15 minutes (Phase 9 open decision 1; `CLAUDE.md`,
  "Supabase"). One factor per user (`max_enrolled_factors = 1`, Phase 9 #13).
- **A session** ends 12 hours after its first factor's sign-in (the time-box, Phase 9 #4,
  Phase 9 open decision 2), or at a logout on any device (Phase 9 #5), until Pro's timeouts
  replace the time-box in Phase 11. The time-box's and the allowlist's limits are
  `CLAUDE.md`'s ("API responses"). Secure password change is on with its email, and so are
  the factor-enrolled and factor-unenrolled emails (IS #378, IS #381). A stolen `aal2`
  session can still swap the admin's factor for its own, which Free can't block: Phase 9 #13
  records what holds instead, the recovery order included.
- **Cookie sessions through `@supabase/ssr`** (Phase 7 #12). The proxy refreshes the session
  and writes its cookies; admin routes only read them; `/auth/callback` and `POST
  /auth/logout` write their own. Logout is `signOut({ scope: 'global' })` since Phase 9
  (Phase 9 #5; `'local'` before it), then deleting the `sb-*` cookies itself, answered with
  a 303 to the login (Phase 7 #28).
- **Three clients** (Phase 7 #27): `supabase.ts` (`supabaseAdmin`, server only, behind
  `server-only`), `supabase-browser.ts` (`createBrowserClient`, for Auth only) and
  `supabase-session.ts` (the cookie-session clients for the proxy, the routes, the
  `/admin` and `/admin/mfa` pages, the callback and logout).
- **The check.** `admin-auth.ts`'s `verify`, which `requireAdmin` and `mfaStepAllowed`
  share, runs in this order: no session cookie → reject before any network or DB call; then
  the session's access token, verified by Auth (`getUser(token)`), whose `aal` and `amr` it
  reads (Phase 9 #11, Phase 9 open decision 11); a first factor other than `magiclink`, or
  one past the time-box, is signed out at Auth with `scope: "local"` and answered as no
  session, or as unavailable if that sign-out failed, so a later request tries again; then
  `users.is_admin`, read through the db layer (`getUserById`, Phase 7 #14).
  `requireAdmin` then admits only `aal2`: an admin route answers an `aal1` admin session 401
  with its own text (Phase 9 open decision 6), and the proxy sends it to `/admin/mfa`, which
  `mfaStepAllowed` lets through (Phase 9 open decision 5). An Auth or database failure is
  "unavailable", never "logged out": 503 `{ error }` on a route, a Swedish error on a page
  (Phase 7 #32). The proxy runs the check for `/admin/*` and `/api/admin/*`, letting the
  login through; `withAdmin` runs it again on every admin handler (Phase 7 #13), sets
  `Cache-Control: no-store` (Phase 7 #15), refuses a write whose `Origin` isn't this origin
  (Phase 7 #16; `requestOrigin` reads the headers, because `next dev`'s `request.url` isn't
  the browser's host), and reads bodies through `readJson`.
- **Writes** go through API routes, route → service → db (Phase 7 #11); the server sets
  `created_by` and `source` (Phase 7 #17). An overlap (`23P01`) and a duplicate Instagram
  handle (`23505`) are 409s; handles are stored in one form, lower-case with no `@` (Phase 7
  #29).
- **The screens** are phone-first and Swedish, with "Poster" and "Foodtrucks" in every header but
  the login's and the TOTP step's (`AdminNav`, Phase 7 #37), and "Karta", a plain `<a>` to `/karta`,
  so the map loads as its own document under the static CSP (the Phase 10 plan's "Functions and
  components", `AdminNav`; its comment). "Ställ in" and "Sätt inaktiv" ask first (Phase 7 #37); ✗ on
  the checklist lives in `localStorage` (Phase 7 #20); "Inställt idag" isn't built (Phase 7 #19).
  The place picker has a name field, a map on demand and five recent places (Phase 7 #35).
- **Pages** under `/admin` render per request with the proxy's nonce CSP (IS #387;
  `CLAUDE.md`, "Security headers").
- **Checked on the owner's phone on the preview:** login and logout, with `/api/live` still
  cached for a logged-in admin (IS #224); an entry reaching the public map (IS #228); the
  whole walkthrough (IS #232, its history inserted by SQL: Phase 7 #38); Phase 9's
  checkpoint: the link, the TOTP enroll and code on the phone alone, an entry reaching
  `/map` (now `/karta`), logout ending the other device's session, and no CSP block in the desktop
  browser's console on the same pages; the phone's console, and the enroll page's, weren't
  read (IS #392). Phase 10's on production: the admin's magic link, the TOTP enroll on the
  phone, and `/admin` (IS #463), then the gate and the login checks of IS #464.

## Pre-deploy automation

Planned by the owner on 2026-10-24 (IS #176) as **one piece of work, designed together, before the
first production deploy**. Since IS #265 and IS #278 (Phase 8 plan #1), Phase 8 built what was "To
build" ("Built in Phase 8", below), Phase 9 did the first 2FA audit (IS #391), and Phase 10 ran the
rest of "Before the production deploy" (done, below). Since Phase 8, CI is the gate: `CLAUDE.md`
"Testing" says which checks the rulesets require and what they can't see.

**Already on** (repository and account settings, the owner, 2026-10-24, unless dated):
- **GitHub Secret Protection and push protection** on the repository, and push
  protection for the owner's account. A history scan found no secret.
- **Dependabot alerts and malware alerts**, with the dependency graph. One auto-triage
  rule is enabled, GitHub's preset "Dismiss low-impact alerts for development-scoped
  dependencies"; the preset "Dismiss package malware alerts" is disabled. Phase 8 reviewed
  what the rule had dismissed (#299, 2026-11-16): one alert, #6 (`zod`, dev, high), since
  fixed, and none still dismissed. Alert #8 (`minimatch`, dev, the advisory alert #7 had)
  stays dismissed by hand, and the rule stays on (the owner's calls). A dismissed alert
  gets no update PR; CI's `audit` still fails on a critical advisory anywhere and a high
  one in production dependencies.
- **Dependabot security updates** (2026-11-16, #300).
- **Squash merging off** (2026-11-16): the closing-keyword check reads a PR's commits and
  the merge commit GitHub will write from its branch name and title; a squash would join
  every message into one it doesn't read (IS #368; `scripts/closing-keywords.mjs`'s header).
- **Two-factor authentication** (the rule is `CLAUDE.md`'s, "Secrets"): the owner's
  GitHub account and the Cloudflare, Supabase and Vercel accounts Phase 6 created all
  use a mobile authenticator app (the owner's confirmations in PRs #194, #195 and #197,
  and for GitHub, and every method, in PR #204, 2026-11-03). **Phase 9's audit** (IS #391,
  2026-11-19, the owner in each account's security settings; no address, secret or code
  recorded): 2FA on with no SMS anywhere, and recovery codes kept offline, on those four
  accounts, each one's recovery mailbox and the admin's login mailbox; the repository's only
  collaborator is the owner; no account came from Phase 9's CAPTCHA or alerting steps (none
  was created). Supabase Free can't require MFA of an organization's members, so each
  account's own 2FA is the control.
  **Phase 10's re-check** (IS #460, 2026-11-22; its comments are the record, and the list):
  two-factor by authenticator app or passkey, no SMS method and recovery codes kept on GitHub,
  Supabase, Vercel, Cloudflare, the registrar (Oderland, since IS #452), the removal-contact
  mailbox, production's admin login mailbox and the other mailboxes these accounts log in
  with; the repository, the Vercel team and both Supabase organizations (the preview's and
  production's) have only the owner. It corrects the audit above: one Google mailbox still had
  a phone number as a second step, and a recovery phone and address, which the owner removed
  on 2026-11-22 (process-log row 920), so "no SMS anywhere" held only from then. None of the
  mailboxes has a recovery address yet; the owner adds them later, each with two-factor.
  @vararmaten, the Instagram account that tells the trucks and takes removal requests, uses an
  authenticator app, not SMS (the owner, IS #511).

All of these can be switched off without any change in the repo. They were checked in
the GitHub UI: the CLI token used here, though it has admin rights, gets `403` from the
secret-scanning, Dependabot-alerts and vulnerability-alerts APIs, and no
`security_and_analysis` field (probed 2026-10-24). The one read by command is squash
merging (`gh api repos/{owner}/{repo}`: `allow_squash_merge: false`, 2026-11-16), and
both rulesets also refuse it: their allowed merge methods are `merge` and `rebase` (the
owner, 2026-11-16; `gh api repos/{owner}/{repo}/rulesets/<id>` reads them back).

**Built in Phase 8** (`.claude/plans/phase-8-ci-cd.md` records each step and its probes):
- **The secret scan.** Gitleaks in `.githooks/pre-commit` (the staged changes) and
  `.githooks/commit-msg` (the message), through `core.hooksPath`, set by hand in each clone
  (Phase 8 plan #7; `CLAUDE.md`, "Secrets"); and `ci.yml`'s `secret-scan` on the PR's
  commits and their messages, since a clone without the hooks, or a commit made on GitHub,
  skips them. The one-off history scan found no real secret; rerun with `--text`, its one
  find was probe PR #344's made-up value (the plan's open decision 1, #13).
- **CI.** `ci.yml` on every PR into `dev` and `main`, and `codeql.yml`: the Phase map's
  Phase 8 row lists the jobs.
- **SAST.** CodeQL alone. Its result check `CodeQL` and both analyze jobs are required on
  `dev` (Phase 8 plan #14) and, since IS #461, on `main` (Phase 10 plan #9). SonarQube Cloud
  was dropped in step 9: its Free plan has no custom quality gate (#295); #349's re-scan
  before the production deploy found nothing to fix, and the project, organization and account
  were then deleted (2026-11-22). `npm audit` runs in `audit` with the draft's Q35 thresholds
  (Phase 8 plan #12; `CLAUDE.md`, "Dependencies").
- **Dependabot.** `.github/dependabot.yml`: version updates for GitHub Actions, weekly,
  minor and patch grouped into one PR, with a 7-day cooldown; npm gets security updates
  only, from the repository setting. Its updater runs Node 24, below `devEngines`, but its
  lockfile commands pass `--force`, under which npm only warns (the plan's open decision 9,
  PR #362); no Dependabot npm job has run yet. A `next` security PR moves `next` alone, so
  `eslint-config-next` is moved to the same version and `/karta` checked in a browser before
  it merges (`CLAUDE.md`, "Dependencies"; `dependabot.yml`'s header). Its first PR, #366,
  ran every required check, `CodeQL` included, and Vercel's Ignored Build Step cancelled its
  build. A Dependabot PR is reviewed like any other; nothing merges on its own.
- **Branch protection.** Rulesets on `dev` and `main` with no bypass list, so they bind
  admins (Phase 8 plan #11); what they require is `CLAUDE.md`'s ("Testing"). Each check
  required by #298 was seen red on a probe PR the rules then blocked (Phase 8 plan #5, #6).
  `base (main)`, required after it (IS #356), was shown only by its absence: probe PR #359
  read `BLOCKED` while no run against `main` had reported it.
- **Branches kept off Vercel builds.** The Ignored Build Step cancels `dependabot/` and
  `probe/` branches. A branch's `vercel.json` `ignoreCommand` overrides it, so the secret
  key is scoped to `dev`'s previews alone (Phase 8 plan #15; `SETUP.md`, "Preview
  deploys").
- **`SECURITY.md`** and GitHub's private vulnerability reporting (#296). A reported
  vulnerability, and once production exists an unfixed one found in-house (Q36), is fixed in
  its advisory's private fork and shipped by a public PR, public from the push of its branch
  (Phase 10 plan #13, IS #347; `RUNBOOK.md`, "A private vulnerability").
- **Secrets in CI runs.** No required check needs a token (SonarQube Cloud's would have),
  so none was copied to the Dependabot secrets store. CodeQL ran on Dependabot's first PR
  (#366); no fork PR has run it yet (none had been opened, 2026-11-16).

**Before the production deploy** (done in Phase 10; the plan's steps 13 to 16 and their issues hold
the records):
- **Every account checked against `CLAUDE.md`'s two-factor rule** ("Secrets"): IS #460's
  re-check, under "Two-factor authentication" above.
- **Production's hosted Security Advisor**: IS #458's two runs (`db advisors --linked`,
  `--type security` and `--type all`) found no ERROR or WARN, INFO only, and IS #460's later run the
  WARN `auth_leaked_password_protection`, which the checklist accepts (Pro only) (`SETUP.md`,
  "Production"), by the owner's threshold (round 3 on PR #281): no ERROR, every WARN fixed or
  accepted with a reason, INFO read. `SETUP.md`'s "Hosted settings checklist" (IS #390; Phase 9 plan
  #10) was applied to production.
- **The Ignored Build Step checked before Production got its variables** (Phase 10 plan #9,
  IS #463; `SETUP.md`, "Preview deploys", for what it cancels and doesn't: promoting an
  existing preview, a CLI deploy untried, and a branch's `vercel.json`). A promotion doesn't
  pass through the step, so a branch preview is never promoted to Production.
- **Every earlier credential rotated, replaced or disabled, but those open decision 12 keeps with a
  reason** (IS #460, whose comments list each by name): production's Supabase project has new keys
  by construction; its secret key was replaced twice, its database password reset, its legacy API
  keys disabled and legacy JWT secret revoked; the CLI login, the GitHub token, Cloudflare's Global
  API Key and Vercel's bypass secret replaced; the preview's legacy keys disabled. Account passwords
  weren't, by the owner's reason that none was ever in the repo, a shell or an agent session.


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
| Supabase | Free, then Pro | Free since the production deploy (Phase 10, the soft launch); Pro **at the full launch** (Phase 11; Free has no backups or session timeouts: until then the weekly dump stands in for backups, "Principles and risks", and Phase 9's time-box for the timeouts, Phase 9 plan #4); before it, at ~50% of any Free quota, an issue decides between reducing the usage and Pro (IS #525) | $0, then $25 |
| Cloudflare R2 | pay as you go | since Phase 6, tiles only | $0 at expected traffic |
| A domain | a registrar | bought in Phase 10 (`vararmaten.se`, `varärmaten.se` at Oderland, IS #452), unused until Phase 11; renewed automatically, the invoice paid by hand each year (IS #525) | a yearly fee, not priced |
| Vercel | Pro + Spend Management (pause cap) | before a marketing push, or when commercial, whichever first; at ~50% of any Hobby limit, an issue decides between reducing the usage and Pro (IS #525) | ~$20/member + capped usage |

- **The Hobby cliff is the main availability risk, from success more than attackers.**
  Hobby has 1M CDN requests a month shared by the page, chunks, polls **and tiles**,
  and going over makes the site unavailable for up to 30 days (no bill). Hobby is also
  non-commercial only. Hence tiles on R2 (row 265; already on previews, Phase 6 #7)
  and Pro before marketing.
- **R2:** 10 GB storage and 10M Class B reads a month free, egress free. ~30–60 reads per
  visit covers ~200k visits a month. At the full launch (Phase 11): a **custom domain** on
  Cloudflare DNS (not `r2.dev`). The CORS rule keeps naming the app's origins,
  production's `https://vararmaten.vercel.app` (an origin each: `SETUP.md`, "Map
  tiles on R2"; the project's alias has none, IS #506, a call asked again at the full launch), the preview
  pattern and localhost, and gains the app's own domain if it
  gets one, or the map loads blank. The bucket (Standard storage) and its CORS rule exist
  since Phase 6, on `r2.dev` with a preview pattern (`SETUP.md`, "Map tiles on R2").
  Skip the Protomaps Worker.
- **Supabase Free:** 500 MB database, 5 GB egress, no backups, no session timeouts, Auth
  audit logs kept 24 hours in its logs (the `auth.audit_log_entries` table keeps them while
  "Write audit logs to the database" is on: on for the preview since 2026-11-18, and for
  production by `SETUP.md`'s hosted-settings checklist; `retention.sql` deletes its rows after 30
  days, Phase 10 plan #10, open decision 3), no leaked-password
  protection, no usage, spend or 5xx alert to set (the weekly routine looks at the usage pages
  and 5xx logs instead, Phase 10 plan open decision 7), and no MFA enforcement
  for an organization's members (IS #391). It pauses a project with too little activity ("a
  few user requests to the database each day" is typically enough); a paused project keeps
  its data, restorable for a year, and Supabase emails a week before. While paused, the
  admin screen and `/api/live` fail until it is restored; in the soft launch, before the
  trucks are back, a week with few entries could pause it: accepted, with `RUNBOOK.md`'s "A
  paused project" (Phase 10 plan open decision 8). Two active free projects, counted across
  every organization where the owner is Owner or Administrator: the preview's and, since Phase
  10, production's (Supabase's docs and pricing page, read 2026-11-16; IS #373 (Phase 10)).
  Pro's spend cap is on by default. At Phase 11's upgrade, keep preview projects in a
  separate free org, or delete them. Phase 9 chose the time-box and logout, not Pro from the
  deploy (Phase 9 plan #4), so Pro stays Phase 11's.
- **On Vercel Pro, Spend Management with a pause cap is required**, or traffic not
  classified as DDoS is billed on demand.
- Vercel deprecated Node 20 on 2026-10-01. Deploys build on the major `engines.node`
  pins (Part 1, "Versions").

## Open decisions

For the plans to settle (`transition.md` §12). Phase 7 settled the checklist look-back
(Phase 7 plan #22) and the pre-filled times (#23); Phase 10 settled the three left for the
launch (its plan's open decisions 1, 2 and 4): the location history is kept 52 weeks after
an entry ends (IS #454), the app is Väm (IS #452), and the removal contact is
`vararmaten@proton.me`, a mailbox for this app alone (IS #456).

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
  `/integritet` states its purpose and periods (Phase 10 plan #8, #10); a takedown deletes
  the truck and its history, and the weekly dumps keep it until they age out, about four
  weeks (`RUNBOOK.md`, "A takedown request").
- Backups: Supabase Pro at the full launch (Phase 11). Until then (Phase 10 plan #11), a
  weekly `supabase db dump --data-only --schema public`, never the `auth` schema (its
  sessions and refresh tokens are credentials), kept only on the owner's machine outside the
  repo, **the newest four** (open decision 5), so a takedown or a retention delete leaves the
  backups about four weeks later (`RUNBOOK.md`, "Backups"; an incident hold or a restore can
  keep them longer, each at most 8 weeks). A restore recreates the admin by its
  old id through Auth's admin API before the dump is loaded (open decision 11; the CLI's data
  dump loads with its foreign keys unchecked, so `users` and `locations.created_by` would
  otherwise point at no auth user), with a long random password (`CLAUDE.md`, "Supabase"),
  then re-runs every takedown in **the takedown log** (the truck's id and date, kept beside the
  dumps, never in the repo or the database) and `retention.sql`. The admin enrolls TOTP again
  at once: until then any `aal1` session can fill the free slot at Auth (Phase 9 plan #13).
  The restore test ran on the local stack (IS #455); `RUNBOOK.md`'s "A restore" is the
  procedure.

---

# Part 3 — Standing rules

These hold in both the current state and the target design.

**Owned by `CLAUDE.md`:** Supabase clients and keys, secrets, grants and RLS, architecture
layers, the db layer, `proxy.ts`, the security headers, API responses (`withErrorHandling`,
the `{ error }` shape, `aal2`, the time-box, logout), the `/api/live` rules, locations, UI
rules and time. This part doesn't restate them. Part 1's "Database" and Part 2 do describe
several of them (the db layer, RLS and grants, the trigger's SQL rule, `/api/live`, the auth
check order) **together with their reasons**; where one of those statements and a
`CLAUDE.md` rule disagree, the `CLAUDE.md` rule wins and the statement is corrected. A rule
restated in two files drifts (process-log rows 291, 293, 294, 295).

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
`useLogin`, `useMfa` (the TOTP enroll and code), `useAdminScreen`, `useAdminLocations` (the
list), `useLocationForm`, `usePlacePicker` with `usePickerMap` and `useGeolocation`,
`useChecklist` and `useTrucks`. The error pages: `useFocusOnMount`. The list, the form, the
recent places, the checklist and the trucks go through their uncached admin routes;
`useLogin` and `useMfa` call Supabase Auth,
`useGeolocation` reads the browser's position, `usePickerMap` drives the picker's map and
`useAdminScreen` joins the others. What each holds is its header comment.

## Status codes

`400` bad input (an edit, cancel or confirm of an entry that has ended included, Phase 9
plan #8) · `401` not authenticated, or an `aal1` session, told apart by its text (Phase 9
plan open decision 6) · `403` authenticated but not allowed (not admin, or a write from a
foreign `Origin`) · `404` an entry or truck that doesn't exist
(or an entry already cancelled) · `409` conflict (an overlapping entry, from `23P01`; a
duplicate Instagram handle, from `23505`) · `500` unexpected · `503` Auth or the
database couldn't say whether the session is an admin's (Phase 7 plan #32), or a refused
session's sign-out at Auth failed (Phase 9 plan #4, #14).

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
| Phase 5 #6, #7 | Revoke, then grant per table; foreign keys to `trucks` stay `NO ACTION`. **The takedown is one statement** (`supabase/manual/takedown.sql`, built in Phase 10, IS #453): delete the truck's locations, clear each `users` row whose `truck_id` points at it (the account stays), then delete the truck, all or nothing; each one is logged in the takedown log, which a restore re-runs (Phase 10 plan #11) | `CLAUDE.md` "Hard Rules" ("Supabase", "db layer", "Locations"); `takedown.sql`'s header; `RUNBOOK.md` "Takedown" |
| Phase 5 #12; Phase 6 #13 | `label` is nullable; a missing one leaves the popup's place line out | Part 2 "Read path" (client) |
| Phase 5 #19; PR #167 round 5 (`max_rows`) | A hosted project is checked for `sv-SE-x-icu`, both extensions in `extensions` and the Data API's Max rows before the app uses it (the preview project's passed, 2026-11-02; production's, 2026-11-22, IS #458) | Part 1 "Database"; `CLAUDE.md` "Hard Rules" ("db layer", Max rows) |
| Phase 5 #9, #11, #13 | Built in Phase 7: the checklist reuses `findLocationsOverlapping` with its own day windows; truck writes came with the truck screen; the Gothenburg box is checked by the location validator, never a database CHECK | Part 1 "Database" (the db layer, coordinates) |
| Phase 6 #1 (IS #176) | CI/CD (the four gates in GitHub Actions), SAST, a pre-commit and CI secret scan, Dependabot security updates once CI runs, and branch protection are one piece of work, built before Phase 10's production deploy. Built in Phase 8, with CodeQL as the SAST (SonarQube Cloud dropped, #295; the split into Phases 8, 9 and 10: IS #265, Phase 8 #1) | Part 2 "Pre-deploy automation"; `CLAUDE.md` "Testing" |
| Phase 6 #2 (IS #176) | The "deploy" in the 2026-09-06 decision "Gates stay manual until deploy" was the official production deploy, not a preview deploy. The gates stopped being manual before it: since Phase 8, CI is the gate (IS #297) | `CLAUDE.md` "Testing" (CI is the gate) |
| Phase 6 #3 (IS #176) | Two-factor authentication on every account that can reach the project, by passkey, hardware key or authenticator app, not SMS; set up as each account is created, checked again before the production deploy | `CLAUDE.md` Hard Rules ("Secrets", the rule); Part 2 "Pre-deploy automation" (which accounts meet it, and the pre-deploy check) |
| Phase 6 #4 (IS #176) | Every credential that existed before the production deploy is rotated, or replaced by a new project's, before it. Done in Phase 10, narrowed by its open decision 12 (IS #460): every earlier credential rotated, replaced or disabled, but those it keeps with a reason: production's publishable key, its current signing key and the admin's password; the preview's other credentials, which reach only the preview (its legacy keys disabled); and the account passwords, by the owner's reason that none was ever in the repo, a shell or an agent session | Part 2 "Pre-deploy automation" ("Before the production deploy", done). `CLAUDE.md`'s rotation rule ("Secrets") is another one, for a secret that reached a commit |
| Phase 6 #5 (IS #176) | Hosted secrets for deploys and CI live in Vercel environment variables, GitHub Actions and Dependabot secrets; developers' own copies stay on their machine; none in a tracked or shared file | `CLAUDE.md` Hard Rules ("Secrets") |
| Phase 6 #6 (IS #178) | `next.config.ts` sets `experimental.agentUpgrade: false`, so an agent-run build or dev server doesn't fail, or query the advisory source, when an advisory covers the installed Next; advisories come through Dependabot alerts and `npm audit` | `CLAUDE.md` "Dependencies"; the comment in `next.config.ts` |
| Phase 6 #7 | The tiles are on Cloudflare R2 for every deploy, pulled forward from the launch; development keeps the local file; the custom domain is Phase 11's (IS #373 (Phase 10)); production reads `r2.dev` like a preview, its origin in the CORS rule (IS #459) | Part 1 "Map tiles"; Part 2's Phase map (the custom domain, Phase 11 row) and "Pricing" |
| Phase 6 #9, #10, #11, #17, #20 | The read path's server: the `is_active` filter in the service, the first service, entries built field by field, no segment config on the route, a row failing `isLiveEntry` dropped | Part 2 "Read path" (server); `CLAUDE.md` "`/api/live`" (no segment config, the column list) |
| Phase 6 #12, #14, #15, #16, #21; open decisions 5–8 | The map's behaviour: one marker per truck, a pure marker diff, the clock only in hooks, a failed poll keeping the last good markers with a notice, the popup's hours and freshness text, the empty state, two marker states | `CLAUDE.md` "UI Rules" (#12, #16, open decision 5); Part 2 "Read path" (client) |
| Phase 6 #18 | The preview database is a separate, disposable free project, with preview keys only; production has its own project, new in Phase 10 (IS #458), in an organization of its own | Part 2's Phase map (Phase 10 row); "Pricing" ("Supabase Free"); `SETUP.md` "Production" |
| Phase 6 #22 | The read path's scaling limits are known and written down, with their fixes and the first trigger; nothing is built for them yet | Part 2 "Read path" ("Scaling limits") |
| Phase 6 #23 (PR #201) | The Phase 6 retrospective's calls: `scripts/sweep.sh` (IS #200); the review-row level and limit rule retired (from row 422 a review row records neither, and a count may have been cut by the default limit); no action on row 325's repeats | `CLAUDE.md` "Review rounds"; the log's "Columns" ("What one row is") |
| Phase 6 #24 | Dependabot alert #7 (`minimatch` before 11.0.1, dev only) dismissed, its advisory in alert #8 since 2026-11-07 and kept dismissed (#299); revisit if `npm audit --omit=dev` lists it or a lint run takes glob patterns from outside the repo | Part 1 "Versions" |
| Phase 6 open decisions 1, 3, 4, 9, 10, 11 | The preview setup: the bucket's `r2.dev` URL, the newer Supabase keys in the old variable names, Stockholm for both regions, `onFail: "error"` and `engines.node: "26.x"`, the CORS pattern, Deployment Protection with a bypass secret | `SETUP.md` "Map tiles on R2", "Hosted preview database", "Preview deploys"; `CLAUDE.md` "Dependencies" (open decision 9) |
| IS #200 (PR #202) | Each review round's sweep runs `scripts/sweep.sh`, whose hits are a floor, not the list; `claims.sh` lists the probe words; both read the diff through `scripts/lib/diff.sh` | `CLAUDE.md` "Review rounds"; the scripts' headers |
| IS #170 (PR #174) | Schema guards get negative controls in `tests/controls/`, run by `node scripts/controls.mjs`, which CI's `controls` check runs (Phase 8 #16) | `CLAUDE.md` "Testing"; `.claude/commands/create-issues.md` "Failure modes" |
| Phase 7 #1 (IS #205) | What a review fix may add, and what becomes a stated limit or an issue instead. Measure: fix-added code's share of the findings after round 1 (20.1% in rows 441–542, from 18.8% in #203; the Phase 7 retrospective) | `CLAUDE.md` "Review rounds" ("Applying a finding") |
| Phase 7 #2 (IS #205) | The order for a false or too-broad claim: cut first, reword last. Measure: new imprecision's share after round 1 (12.8% in rows 441–542, from 22.1%) | `CLAUDE.md` "Review rounds" ("Applying a finding"; the claims check points to it) |
| Phase 7 #4, #39 (IS #207, #260) | The review round ceiling: full, scoped, full, then stop, with one scoped round on the fixes when the last full round finds a defect in what runs. Measures: PRs past the ceiling (2 of 20 in rows 441–542) and rows with `Escaped` `merged` (3 in 441–542); neither should rise. Neither sees a defect a dropped round would have found. Phase 8 retrospective: 5 of the 40 PRs from #263 on past it, all at the owner's request, and 8 `merged` rows in 543–699; kept | `CLAUDE.md` "Review rounds" ("The round itself") |
| Phase 7 #5 (IS #207) | The final records check, and rounds skipping the records. Measure: records findings (2 of 560 named in rows 441–542, from 54 of 498) and record errors found after merge (2: rows 453, 537); each PR body gives the count of errors the final pass found | `CLAUDE.md` "Review rounds" ("The final records check") |
| Phase 7 #6 (IS #207) | A fix changing what the owner approved goes back to the owner. Measure: log rows recording such a change made without asking (1 in Phase 7, row 513) | `CLAUDE.md` "Review rounds" ("Applying a finding") |
| Phase 7 #7 (IS #209) | The reconciliation also brings `README.md`'s status parts in line (narrowed between phases, IS #264, below). Measure: reconciliation review findings on them (row 432; judged in IS #234's PR) | the process log's "How to use it", part 6 |
| Phase 7 #8 (IS #209) | While a plan is current, stale hits in `project-context.md` or the README's status parts wait for the reconciliation, named in the plan's reconciliation step. Measure: unordered edits by other PRs (0 in Phase 7) | `CLAUDE.md` "Review rounds" (the sweep's step 3) and "Doc changes"; the process log's "How to use it", part 6 |
| Phase 7 #9 (IS #211) | New text, like a sweep hit, points to where a rule or fact lives instead of restating it. Measure: restated copies' share after round 1 (6.4% in rows 450–542, from 9.8%) | `CLAUDE.md` "Review rounds" (the sweep's step 3) |
| Phase 7 #39 (IS #233, PR #261) | The Phase 7 retrospective's calls: #1, #2 and #5–#9 kept, #4's ceiling adjusted; #3's re-run of #203's classification done (it doesn't outlive the phase); the Phase 6 retrospective's actions unchanged; no new action | the process log's Phase 7 retrospective; the Phase 7 rows above |
| Phase 7 #10, #11, #13, #14, #15, #16, #32 | The admin API is under `/api/admin/*`, writes go through API routes, `withAdmin` wraps every admin handler (the test finds them on disk), `is_admin` is read through the db layer, admin answers carry `no-store`, a write from a foreign `Origin` is refused, and an Auth or database failure is 503, not "logged out" | `CLAUDE.md` "proxy.ts" and "API responses"; Part 2 "Admin and auth" |
| Phase 7 #12, #27, #28 | Cookie sessions through `@supabase/ssr`; `supabase.ts` stays the server-only module beside `supabase-browser.ts` and `supabase-session.ts`; logout sits beside the callback, signs out (every session since Phase 9 #5), deletes the `sb-*` cookies and answers 303 | `CLAUDE.md` "Supabase"; Part 2 "Admin and auth" |
| Phase 7 #17, #18, #19, #20, #33; open decision 9 | The server sets `created_by` and `source`; "Stämmer fortfarande" moves `updated_at` with no migration; "Inställt idag" isn't built; ✓ is an ordinary create and ✗ writes nothing to the database; an entry that has ended can't be saved or edited, nor cancelled or confirmed (extended by Phase 9 #8) | Part 2 "Product model" and "Admin and auth" |
| Phase 7 #22, #23, #24, #30, #34, #35; open decision 8 | The checklist's 4-week look-back at the most recent matching day, with no "Alla stämmer" button for now; the 11–13 pre-fill, kept after 13:00; the date field; an end at or before the start is the next day; the place picker | Part 2 "Product model" |
| Phase 7 #29 | Instagram handles are stored lower-case, with no `@`, matching `^[a-z0-9._]{1,30}$` | Part 2 "Admin and auth"; `src/lib/validators/truck.ts` |
| Phase 7 #31 | Stockholm days come from `stockholm.ts`'s whole-day arithmetic, never `now - 7 × 24 h` | `CLAUDE.md` "Time" (added by IS #234) |
| Phase 7 #36 | An issue's browser checks run locally at phone width; the phone on `dev`'s preview is for checkpoints | `CLAUDE.md` "Testing" |
| Phase 7 #37 | "Poster" and "Foodtrucks" in every admin header but the login's and the TOTP step's, with "Karta" beside them since Phase 10; a question before "Sätt inaktiv" | Part 2 "Admin and auth"; `AdminNav.tsx` |
| Phase 7 #25, #26; open decision 10 | History retention and the app's final name were the launch's, settled in Phase 10: 52 weeks after an entry ends (its plan's #10, open decision 2, IS #454) and Väm, in every text and the TOTP label, with `vararmaten.se` and `varärmaten.se` bought for Phase 11 (open decision 1, IS #452) | Part 2 "Open decisions"; `retention.sql`; the app's texts |
| Phase 7 open decisions 1–5 | The login is the magic link, then TOTP (Phase 9 #14; IS #241's emailed code waits for custom SMTP or Pro); a session ends at the 12-hour time-box (Phase 9 #4) or a logout on any device (Phase 9 #5), until Pro's session timeouts in Phase 11 (IS #373 (Phase 10)); a phone gets past Deployment Protection by logging in to Vercel; the preview's Redirect URLs are `dev`'s alias alone, no wildcard; the admin user is made by hand | `SETUP.md` "Hosted preview database" (the Redirect URLs) and "5. Create the admin user"; Part 2 "Admin and auth" (the login, the session); `CLAUDE.md` "API responses" (the time-box, logout); this row (a phone's Vercel login) |
| Phase 8 #1 (IS #278 (D1)) | Three phases after Phase 7: **8 · CI/CD → 9 · Security → 10 · Launch** (a fourth, 11 · Full launch, added by IS #373 (Phase 11)), CI/CD first so the security work runs through it. The line between them: 8 the pipeline, 9 the running app and its accounts (the first 2FA audit included), 10 production. Replaces the IS #265 row (2026-11-11, its text in PR #266), keeping what still holds of it: the launch is a phase of its own and runs through working CI, the owner's call to keep each milestone smaller, and Phase 6 #1 holds, CI/CD built before the production deploy. Outside the three: #264 (the README rework) after Phase 8, and #246 and #259 standalone (the owner's calls, the scope draft's D1, Q16, Q17), and #248 and #256 standalone as the draft lists them; the Owners phase gets its own threat model (the draft's Appendix A, A06) | Part 2's Phase map and the Roadmap; Part 2 "Pre-deploy automation" (its intro); `.claude/drafts/phases-8-10-scope.md` ("Decisions", "The line between the phases", "Outside Phases 8–10") |
| Phase 8 #2 (IS #278 (Phase 8)) | Phase 8's scope as the scope draft settled it, as built: GitHub Actions for the checks, grouped by trigger and permissions, one set for `dev` and `main`; Gitleaks, CodeQL, `npm audit`'s thresholds, the security advisor, the lint rules, the controls' trigger and the log check; workflow hardening; Dependabot last, its branches off Vercel builds; branch protection on both branches, `main`'s required checks a production deploy's only gate; `SECURITY.md`; CI as the gate. Its limit: a PR runs its own copy of what its checks read, so the guard is reading every diff, Dependabot's included. The owner's calls (the draft's Q1–Q10, Q25–Q30, Q32, Q35) | `CLAUDE.md` "Testing"; Part 2's Phase map (Phase 8 row) and "Pre-deploy automation"; `.claude/drafts/phases-8-10-scope.md` ("Phase 8 · CI/CD") |
| Phase 8 #3 (IS #279) | The between-phases procedure: a row's marker may name the later phase whose plan takes it ("for Phase <N>"), earlier plans don't take it and their reconciliations don't replace its marker, though a stale fact in it is fixed like any other hit; and a between-phases row that a later one replaces is removed in the PR that adds the new row, which keeps what still holds and cites the old IS #, as the IS #278 (D1) row does for IS #265; and several rows from one issue carry a label each (`IS #278 (D1)`), so a citation names one. Amends Phase 5 #24's procedure. The owner's calls, rounds 1–3 and the narrow read-through on PR #281 | `CLAUDE.md` "Process Log" (the one copy); `.claude/commands/create-milestone.md` (the Rationale's first decisions) |
| Phase 8 #4 | The issue that adds a check is done when the check runs and reports correctly; each finding gets an issue of its own, and one that would keep a required check red is settled (fixed, dismissed or allowlisted with a reason) before the check becomes required | `CLAUDE.md` "Testing" ("Adding a required check"); `codeql.yml`'s header (its findings get their own issues) |
| Phase 8 #5, #6, #13 | A check is done once it has been seen to fail: probe PRs with one break per required check, split only where breaks cascade, named `probe/…`, closed unmerged with their branches deleted, no merge attempted (`--admin` included); `secret-scan`'s with a made-up value Gitleaks flags, run locally first and committed with no local hook, never bypassing push protection | `CLAUDE.md` "Testing" ("Adding a required check") and Hard Rules ("Secrets", push protection) |
| Phase 8 #7 | `core.hooksPath` is set by hand in each clone, never by a `prepare` script, which `npm ci` would run in CI too | `CLAUDE.md` Hard Rules ("Secrets", the Gitleaks hooks); `SETUP.md` "1. Install" |
| Phase 8 #8 | The controls' trigger list is guarded by a test that follows each control's tests' imports | `scripts/controls-trigger-coverage.test.mjs`'s header; `CLAUDE.md` "Testing" ("Schema controls") |
| Phase 8 #9 | Each lint rule has a fixture test: a mistyped selector lints clean | `eslint.config.mjs`'s header; `scripts/lint-rules.test.mjs` |
| Phase 8 #11 | Both rulesets bind admins (no bypass list): a required check red for a reason outside the PRs blocks every merge until it passes again or the rule is lifted by hand. CodeQL's checks joined `main`'s ruleset in IS #461, after the first merge into `main` gave it a base analysis (Phase 10 plan #9) | `CLAUDE.md` "Testing" |
| Phase 8 #12 | `npm audit` in CI: fail on high or critical in production dependencies and critical anywhere, warn on each production advisory, fail when it can't tell; a PR showing the warning gets an issue per advisory before it merges | `CLAUDE.md` "Dependencies" |
| Phase 8 #14 | The required SAST check is the one that fails on a finding: on `dev` and `main` (since IS #461), `CodeQL` and both analyze jobs, by name; a SARIF error with both jobs green still passes | `CLAUDE.md` "Testing"; `codeql.yml`'s header |
| Phase 8 #15 | Vercel's Ignored Build Step, inline in its settings, cancels `dependabot/` and `probe/` branches; the secret key is scoped to `dev`'s previews, since a branch's `vercel.json` overrides the step | `SETUP.md` "Preview deploys"; Part 2 "Pre-deploy automation" |
| Phase 8 #16 | A `controls` run of the full set that passed stands in for the hand run | `CLAUDE.md` "Testing" ("Schema controls": it still asks for a hand run while writing a control or a migration, and when CI ran only `--check`) |
| Phase 8 #17 | Dependabot's PRs keep its default labels, the exception to PRs carrying only a phase label | `.github/dependabot.yml`'s header |
| IS #301 (PR #369), IS #368 (PR #371) | The Phase 8 retrospective's calls: the Phase 7 retrospective's actions kept; one new action, the closing-keyword check in `secret-scan`, with `claims.sh` listing a PR body's closing references; squash merging off, since the check models the merge commit GitHub writes (the owner's call, round 4 on PR #371) | `CLAUDE.md` "Testing" and "Review rounds"; `scripts/closing-keywords.mjs`'s header; the process log's Phase 8 retrospective |
| Phase 9 #1 (IS #278 (Phase 9)) | Phase 9's scope as the scope draft settled it, as built: TOTP MFA for the admin login (the emailed code deferred by #14) and its enroll window; the lost-phone route probed but left open for Phase 10's runbook, which settled it (its open decision 9; the Phase 9 plan's open decision 4: where the recovery's calls run, the plan's step 1 recommending the dashboard's SQL editor, IS #377, which the phone checkpoint used to remove the factor, IS #392; and whether the login needs an unenroll screen; the recovery follows #13's order); the session cover (#4, #5) for Pro-only timeouts; the login-abuse and code-guessing probes and settings (open decision 1); the split CSP and the cookie's reach (#6); monitoring (open decision 7); the smaller probes and limits (`x-forwarded-host`, length limits); the 2FA audit and the hosted-settings checklist. Replaces the between-phases row, which also amended the Phase 7 open decisions 1–5 row (rewritten above). The owner's calls (the draft's D2, D3, Q11–Q14, Q19–Q23, Q31, Q33) | `.claude/drafts/phases-8-10-scope.md` ("Phase 9 · Security"); Part 2's Phase map (Phase 9 row; Phase 10 row, the lost-phone route), "Admin and auth" and "Pre-deploy automation" (the 2FA audit) |
| Phase 9 #2 (IS #373 (Phase 9)) | The soft launch's inputs, as settled: the time-box with a global logout (#4, #5), not Pro from the deploy; secure password change and its email on, locally and hosted, with "Require current password" hosted; only a magic-link first factor admitted (#13, #14), so a password a stolen session sets gets nothing in the app; cancel and confirm refusing an ended entry (#8); `aal` read from a token Auth verified, through `getUser(token)`, not `getClaims()`, so Auth and the app refuse a logged-out token (#11, open decision 11; an access token already issued still reads its own `users` row through PostgREST until its `exp`, `CLAUDE.md` "API responses"); the cookie's reach to `/map` (now `/karta`) accepted (#6); Auth's audit log written to the database (open decision 7). Replaces the between-phases row | Part 2's Phase map (Phase 9 row) and "Admin and auth"; `CLAUDE.md` "Supabase" and "API responses" |
| Phase 9 #4; open decision 2 | Until Pro, `requireAdmin` refuses a session 12 hours after its first factor's sign-in (the `amr` entry that isn't `totp`, never the newest), read on the server's clock held within the token's `iat` and `exp`, and signs that session out at Auth with `scope: "local"`. A stolen token used only against Supabase isn't seen. Phase 11's Pro timeouts replace it | `CLAUDE.md` "API responses" (the session time-box); `src/lib/services/admin-auth.ts` (`SESSION_MAX_AGE_MS`) |
| Phase 9 #5 | Logout signs out with `scope: "global"`, so a logout on one device ends the admin's other sessions | `CLAUDE.md` "API responses" (logout) |
| Phase 9 #6 | The session cookie is readable by page scripts and reaches `/karta` (then `/map`), outside `/admin`'s nonce CSP; accepted, since no public page puts user input into HTML; the public pages' static CSP admits inline scripts. The Owners phase, which adds user-written content, reopens it | `CLAUDE.md` "Security headers" (its limits); Part 2's Phase map (Phase 9 row) |
| Phase 9 #7 | `users_select_own` lets an `aal1` token read the admin's own `users` row through the Data API; accepted with no migration | this row; `0001_baseline.sql` |
| Phase 9 #8 | Cancel and confirm refuse an ended entry, the check and the write in one statement; the service reads the entry after a write that changed nothing, to tell ended from missing or cancelled; `TodayList` hides both buttons on an ended row | Part 2 "Product model" (item 3); Part 3 "Status codes"; `src/lib/services/locations.ts` |
| Phase 9 #9 | The tests reach `aal2` with a TOTP function of our own on Node's `crypto`, checked against RFC 6238's vectors, not a library; an `aal2` fixture (`sessionUser({ aal2: true })`) enrolls its one factor when created; the fixtures sign in through the PKCE magic link, read from Mailpit, with a password or a typed code only for the refusal tests (`firstFactor`) | `tests/totp.ts`'s header; `tests/integration/helpers.ts` (the fixtures' sign-in) |
| Phase 9 #10 (IS #390) | The hosted-settings checklist lives in `SETUP.md` (in the README until IS #264), beside "Hosted preview database"; Phase 10 applied it to production (IS #458) | `SETUP.md` "Hosted settings checklist" |
| Phase 9 #11; open decision 11 | `aal` comes from a token Auth has verified (`getSession()`'s access token, then `getUser(token)`), never a decoded cookie, never "the user has a verified factor", and never `getClaims()`, which would pass a logged-out asymmetric token until it expires | `CLAUDE.md` "API responses" (`aal2`) |
| Phase 9 #13 | One factor per user (`max_enrolled_factors = 1`, locally and hosted); a stolen `aal2` session can still swap the factor, which Free can't block, so it is detected (the password-changed and factor emails, Auth's audit log) and recovered in #13's order: the mailbox, the password, then the factor and every session by SQL (one statement, Phase 10's open decision 9), then a re-enroll at once | `supabase/config.toml` (pinned by `config.test.ts`); `SETUP.md`'s "Hosted settings checklist"; `RUNBOOK.md` "A takeover of the admin account" (the recovery order) |
| Phase 9 #14 (IS #396) | The magic link is the only first factor, and `requireAdmin` and the MFA page admit only an `amr` `magiclink` first factor (the PKCE link's; a typed or guessed code gives `otp`). IS #241's emailed code waits for custom SMTP or Pro, whichever comes first; until then the login keeps IS #240's hint | `CLAUDE.md` "API responses" (`aal2`, the first factor); Part 2 "Admin and auth" |
| Phase 9 open decisions 5, 6, 9, 10 | One `aal1` page, `/admin/mfa`, for the enroll and the code; an admin route answers an `aal1` session 401 with its own text; the CSPs' sources are `csp.ts`'s lists; TOTP is SHA1, 6 digits, 30 seconds | `CLAUDE.md` "proxy.ts" and "Security headers"; `src/lib/http/csp.ts`; Part 3 "Status codes" |
| Phase 9 open decisions 1, 8 (IS #386) | The login-abuse settings, threat by threat: the emailed code Auth still issues is 10 digits and lives 15 minutes, so the rate limits allow about 120 guesses per IP per code, 1 in 83 million (computed from the limits, not observed past 25 guesses; N addresses multiply it), and a guess gives only an `otp` session `requireAdmin` refuses; no CAPTCHA (it wouldn't stop 2 requests an hour made by hand); no change for the forged-cookie flood or TOTP guessing; the rate limits kept as they are, since a lower `token_refresh` would make the flood easier (the server's refreshes share its per-IP budget). The email-budget lockout: the Phase 10 #3 row below | `CLAUDE.md` "Supabase" (the emailed code); `supabase/config.toml` (`otp_length`, `otp_expiry`, the rate limits); `SETUP.md`'s "Hosted settings checklist" |
| Phase 9 open decision 7 (IS #389, #419) | Neither free plan offers a usage, spend or 5xx alert to set, so none is set, and Phase 10 covers them by a look in the weekly routine (its plan's open decision 7); "Write audit logs to the database" is on for the preview and production, and `retention.sql` deletes its rows after 30 days (Phase 10 plan #10) | `RUNBOOK.md` "The weekly routine"; `SETUP.md`'s "Hosted settings checklist"; `retention.sql` |
| IS #393 (PR #423), IS #403, IS #421 | The Phase 9 retrospective's calls: the Phase 8 retrospective's actions kept, the `Caught by` groups adjusted so `check` requires a review row's round and target (#421); one new action, issue and PR text posted through `scripts/post-body.mjs`, which reads it back and, for a PR body, checks its round sections against the log (#403); a stand-ins field in the templates offered and dropped (#422) | `CLAUDE.md` "Doc changes" and "Process Log"; the log's "Columns"; the process log's Phase 9 retrospective |
| Phase 10 #1 (IS #278 (Phase 10)) | Phase 10's scope as the scope draft settled it, as built: the old launch row minus what IS #373 (Phase 10) moved to Phase 11; the hosted-settings checklist applied to production with its Security Advisor run (no ERROR, each WARN fixed or accepted, the owner's threshold); the free plans' alerts covered by the weekly routine (open decision 7); Phase 5 #19's hosted check on production; `RUNBOOK.md`'s incident sections (Q34), with the restore test on the local stack. Q36 stands as #13 amends it: an unfixed vulnerability found in-house once production exists goes to a private security advisory, and its fix is public from the push of its branch, not "until its fix ships" | Part 2's Phase map (Phase 10 row) and "Pre-deploy automation"; `RUNBOOK.md` |
| Phase 10 #2 (IS #373 (Phase 10)) | The soft launch, as built: production with `/karta` shown only to the admin and `/` leading to the Swedish `/om`; only real data, from the trucks' own posts, entered by hand, nothing scraped; every removal request honoured, company or sole trader; it costs nothing (Supabase Free, `vercel.app`, `r2.dev`); the weekly data-only dump stands in for backups (#11); leaked-password protection, which Free lacks, accepted with a reason | Part 1 "What runs"; Part 2's Phase map (Phase 10 row); `CLAUDE.md` "The soft-launch gate"; `RUNBOOK.md` "A takedown request" and "Telling a new truck"; `/integritet` |
| Phase 10 #3; open decision 6 (IS #394, #458, #507) | Spending the built-in email's budget so the admin's link doesn't come stays accepted until the Owners phase's custom SMTP: it needs the admin's address and grants no access; the admin's login address is a mailbox for that login alone, never the public removal contact. A refused request answers 429, and the wait is about an hour after the last email | `CLAUDE.md` "Supabase" (the emailed code); `RUNBOOK.md` "A login link that doesn't come" |
| Phase 10 #5, #6; open decision 10 (IS #448, #450, #451), for Phase 11 | The soft-launch gate is temporary and removable without a hole: it hides `/karta`, protecting nothing, and nothing admin-only goes behind it; it lives in the page alone (Plan A: IS #448's and #451's probes showed the session survives a refresh `readOnlyCookies` can't store), so the proxy's matcher stays as `CLAUDE.md` says; each site carries the marker and is on **the removal list in `src/app/karta/page.tsx`'s header**, its one copy, which `gate-markers.test.ts` checks against `git grep`. **The removal's checks, for Phase 11's plan:** `git grep` finds no marker outside `.claude/`; the build's route table shows `○ /karta`; smoke passes with the restored expectations; `/api/live`'s cache headers are unchanged; `/karta` is checked in a browser. **While it stands:** an admin's rendered `/karta` isn't to be cached and served to someone else (step 17's check, IS #464: three logged-out requests right after the admin's each got the `307` to `/om` with `Cache-Control: private, no-cache, no-store…` and `X-Vercel-Cache: MISS`; the admin's own response headers weren't read) | `CLAUDE.md` "The soft-launch gate"; `src/app/karta/page.tsx`'s header |
| Phase 10 #8; open decision 4 (IS #456, #457) | The privacy note is its own page, `/integritet`, which a removal request links to and which outlives the soft launch; the removal contact is `vararmaten@proton.me`, a mailbox for this app alone, with the owner named as the controller. The runbook is `RUNBOOK.md`, opened in an incident | `src/app/integritet/page.tsx` (its header lists where each fact comes from); `RUNBOOK.md` |
| IS #462, #500 (after Phase 10 #9's first merge into `main`, IS #461) | A release is `dev` merged into `main` by a PR, then `main` synced back into `dev` by a PR, each by a merge commit (`gh pr merge --merge`; the release without `--delete-branch`, which would delete `dev`, and the sync never by a rebase); a merge into `main` closes no issue, so its issue is closed by hand; release only when production needs a change | `RUNBOOK.md` "A release"; `CLAUDE.md` "Testing" (`base (main)`) |
| Phase 10 #10; open decisions 2, 3 (IS #454) | Retention is manual SQL, run weekly after the dump: `supabase/manual/retention.sql` deletes locations that ended more than 52 weeks ago and Auth audit-log rows older than 30 days, in one statement; pg_cron was weighed and not taken, to revisit if a week is missed | `CLAUDE.md` "db layer" and "Locations"; `retention.sql`'s header; `RUNBOOK.md` "The weekly routine" |
| Phase 10 #11; open decisions 5, 11 (IS #455) | The weekly backup is a runbook command: a data-only dump of `public`, never `auth`, on the owner's machine outside the repo, the newest 4 kept, from production's database URL in the gitignored `.env.prod-db.local` (a name Next never loads). A restore recreates the admin by its old id through Auth's admin API before the dump loads, then re-runs every takedown in the takedown log and `retention.sql` | `RUNBOOK.md` "Backups", "The weekly routine" and "A restore"; `CLAUDE.md` "Where secrets live" |
| Phase 10 #12 (IS #478) | The public pages' paths are Swedish, `/om`, `/karta` and `/integritet`, with no redirects from the old ones, which answer 404; `/admin/…`, `/api/…` and `/auth/…` stay; no constant for the map's path | `src/app/om/`, `src/app/karta/`, `src/app/integritet/`; `src/lib/paths.ts` (`ABOUT_PATH`, `PRIVACY_PATH`); `scripts/smoke.mjs` |
| Phase 10 #13 (IS #347) | A private vulnerability, an outside report or, once production exists, an unfixed one found in-house, is fixed in its advisory's private fork and shipped by a public PR with CI, never by the advisory's merge button; before production into `dev`; once production exists, into `main` from a branch off it when the vulnerable code is deployed there, then synced into `dev` with `dev`'s copy checked, and into `dev` when the code is only there; the public records follow the advisory | `CLAUDE.md` "Doc changes" (the exception); `RUNBOOK.md` "A private vulnerability" |
| Phase 10 open decisions 7, 8, 9 (IS #457) | The usage, spend and 5xx alerts the free plans lack are a look at Supabase's and Vercel's usage pages and the 5xx logs in the weekly routine; a paused project is accepted; a lost phone's factor is deleted with the user's `auth.sessions` rows in production's SQL editor, then a re-enroll at once, with no unenroll screen | `RUNBOOK.md` "The weekly routine", "A paused project", "A lost phone" |
| Phase 10 open decision 13 (IS #465, #511), for Phase 11 | Each truck is told it is listed just before it is first entered, by an Instagram DM from @vararmaten in the approved text, or another channel it publishes, and one that can't be told isn't entered; only a truck with its Instagram handle is entered; the owner's private lists (trucks told, and a do-not-list of the handles of trucks that asked to be removed, taken down or never entered for it: step 5) stay off the repo. **For Phase 11's launch issue:** each truck told gets one short second message when the map opens, its text approved there, and the DM texts lose "Kartan är inte öppen för alla ännu…" (a gate site) | `RUNBOOK.md` "Telling a new truck"; `/integritet` |
| Phase 10 open decision 14 (IS #459) | Production's Deployment Retention Policy stays at 30 days: production deploys rarely, and Hobby keeps the last 3 Ready production deployments whatever the policy | `SETUP.md`'s "Hosted settings checklist" |
| IS #466 (PR #514), IS #513 (PR #515) | The Phase 10 retrospective's calls: the Phase 9 retrospective's eight actions kept; one new action, `post-body.mjs --closes`, required on a PR's body, which refuses a closing keyword before an issue the PR doesn't close (#513); `hosted:` lines in `claims.sh` offered and not taken | `CLAUDE.md` "Doc changes" and "Review rounds"; the process log's Phase 10 retrospective |
| **between phases**, 2026-11-16, IS #373 (Phase 11), for Phase 11 | The full launch is a phase of its own, after Phase 10 and before the Owners phase (the owner's call). Proposed: it starts when a coverage target holds: on a typical weekday at least N trucks, entered before 11:00, held for two weeks and checked against their posts (N open; Claude's guess 5–8). It removes the gate and restores the smoke check, by the removal list and checks of the Phase 10 #5 row above, keeping `/om` and the nav link. It holds Supabase Pro, with session timeouts; the custom domain (R2's domain and CORS rule, `NEXT_PUBLIC_PMTILES_URL`, the CSP's tiles domain; and, if the app gets its own domain, Vercel's domain, Supabase Auth's Site and Redirect URLs, and HSTS: open, and Claude suggests one domain with the tiles on a subdomain); Vercel Pro + Spend Management; the acquisition plan | Part 2's Phase map (Phase 11 row); "Pricing and upgrade triggers"; Part 1 "Map tiles" |
| **between phases**, 2026-11-24, IS #264 | The README shows off the project and holds no how-to (the owner's call): the local and hosted setup moved to `SETUP.md`, and "Takedown" and "Backups" to `RUNBOOK.md`. This narrows Phase 7 #7: the README's status parts are now its status banner, its "Project status" table and the phase sentence in "How it works" ("How it's designed to work" until IS #518); "What works today" and "What does not exist yet" are gone, Part 1 "What runs" and the Roadmap in their place | `CLAUDE.md` "Doc changes" ("What goes where", and the tracked docs); the process log's "How to use it", part 6 |
| **between phases**, 2026-11-24, IS #525 (D2) | At 50% of any Supabase or Vercel limit, an issue decides between reducing the usage and the paid plan, replacing Vercel's "Pro at ~50%"; one issue per figure; Supabase's half ends with Pro at the full launch (the owner's calls on #525, 2026-11-24) | `RUNBOOK.md` "The weekly routine", step 3; "Pricing and upgrade triggers" |
| **between phases**, 2026-11-24, IS #525 (D3) | The domains renew automatically at Oderland, and their invoice is paid by hand once a year (the owner's call) | `RUNBOOK.md` "Renewing the domains"; "Pricing and upgrade triggers" |
| **between phases**, 2026-11-24, IS #525 (D4) | The map tiles are looked at once a year, with the domains (the owner's call on #525, 2026-11-24). The refresh's steps are RUNBOOK's | `RUNBOOK.md` "Refreshing the map tiles" |
| **between phases**, 2026-11-24, IS #523 | The daily routine is written from the admin screens as they are, before the first real truck, so it can be followed from the start, and #529 revises it after real mornings (the owner's call) | `RUNBOOK.md` "The daily routine" |
| **between phases**, 2026-11-24, IS #527 | The weekly routine runs at most 7 days after the last run and checks the request inboxes: the removal mailbox with its spam folder, the app's Instagram DMs with their message and hidden requests, and the inbox of each other channel kind the list of trucks told names, while the truck's line is on it. So a request is seen within 7 days, inside the month `/integritet` promises (the owner's calls on #525, 2026-11-24, this row replacing its D1). A truck told outside Instagram gets its channel's kind on its line of the private list, never the address, and `/integritet` says so in the text the owner approved (the owner's calls on #527, the same day) | `RUNBOOK.md` "The weekly routine", step 4, and "Telling a new truck"; `/integritet` |
