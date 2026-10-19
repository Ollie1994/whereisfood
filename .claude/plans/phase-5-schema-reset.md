# Phase 5 — Schema reset

**Planned:** 2026-10-18 · **Status:** agreed through PR #159's review (its
`/code-review` rounds are in the PR body and the process log from row 323); in progress
from its merge
**Source:** `project-context.md` Part 2 ("Phase map", "Data model (Phase 5)", "RLS and
grants (Phase 5)") and the `/create-milestone` conversation of 2026-10-18. Where this
plan and `project-context.md` disagree, **this plan wins** until step 7 reconciles the
context.

**Purpose of the phase:** the database stops describing the old design. Phases 6 and 7
build their read path and admin screen on a schema, types and db layer that already
match the target design, with the security properties proven by tests rather than
stated in comments.

---

## Goal

A single squashed migration creates the target schema (`trucks`, `locations` and
`users`; on `locations` the overlap exclusion constraint, `CHECK (ends_at > starts_at)`
and an `updated_at` trigger; on all three RLS and an explicit per-table GRANT, and no
anon access to `trucks` or `locations`), and the generated types, `seed.sql`,
`db/trucks.ts`, `db/locations.ts` and the integration tests all match it, with all four
gates green and the fake-data map unchanged.

---

## Prerequisites

- Node `^20.19.0 || >=22.12.0` and npm ≥ 11 (`CLAUDE.md`, "Dependencies").
- Docker running, for local Supabase and `npm run test:all`.
- **After pulling step 2, run `npx supabase db reset`.** A local database records
  versions `0001`–`0006` as applied (`supabase_migrations.schema_migrations`, checked
  2026-10-18), and the squash reuses `0001` and removes the rest (decision #3); a reset
  rebuilds the database from the files.

---

## Out of Scope

| Item | Where it goes |
|---|---|
| `/api/live`, `useLocations`, polling, the client timer, marker diffing | Phase 6 |
| Any change to the map's behaviour or look: no `TruckPopup` freshness text or Instagram link; confidence colours and grey markers stay; `fake-data.ts` still feeds the map | Phase 6 |
| A hosted Supabase project, the first preview deploy, #139 (engines) | Phase 6 |
| Any API route, the `services/` layer, the 409 "överlappar" mapping (the db layer lets `23P01` through; Phase 7's service maps it) | Phase 7 |
| Admin login, `proxy.ts` auth, disabling public sign-ups in `config.toml`, splitting `supabase.ts` into server and browser modules | Phase 7 |
| The checklist and "recent places" UI (Phase 5 writes only the db queries behind them) | Phase 7 |
| Truck insert and update primitives (decision #11) | Phase 7 |
| Owner columns on `trucks`, the claim flow, writes with `source = 'owner'` (the column and its enum value exist; nothing writes `'owner'`) | Owners phase |
| A retention or purge job, a scheduler, pg_cron | not planned (retention is open product decision #1) |
| R2 tiles, Supabase Pro, production deploy, the takedown procedure's SQL | Phase 8 |

---

## Files

### Delete
| File(s) | Why |
|---|---|
| `supabase/migrations/0001_initial_schema.sql` … `0006_locations_overlap_index.sql` | Squashed into one baseline (decision #3). |

### Create
| File | Content |
|---|---|
| `supabase/migrations/0001_baseline.sql` | `btree_gist` and `moddatetime`, both in the `extensions` schema; `trucks`, `locations`, `users`, every column's nullability and default stated (decision #17); the exclusion constraint and `CHECK (ends_at > starts_at)`; the `location_source` enum for `source`; the `updated_at` trigger; two partial indexes; RLS and per-table grants (decisions #3–#8, #12–#14, #16–#18). |
| `src/lib/map-types.ts` | The fake-data map's **frozen, hand-written** types: `MapTruck` (today's `Truck`, `last_known_*` included), `MapLocation` (today's `Location`: `confidence`, `is_negation`, the old `source` lanes and the rest), `MarkerColor`, `MarkerState`. Deleted in Phase 6 (decision #1). |
| `tests/integration/schema.test.ts` | Constraint, CHECK and trigger tests (step 3). |
| `tests/integration/rls.test.ts` | RLS and grant tests (step 4). |
| `src/lib/db/complete.ts`, `src/lib/db/complete.test.ts` | `MAX_ROWS` and `assertAllRows`, the `max_rows` check for reads without a `limit`; the unit test pins `MAX_ROWS` to `config.toml`'s `max_rows` (PR #167 rounds 3–4). |
| `tests/integration/db-trucks.test.ts` | Tests for the rewritten `db/trucks.ts`. |
| `.claude/plans/phase-5-schema-reset.md` | This plan. |

### Modify
| File | Change |
|---|---|
| `src/lib/database.types.ts` | Regenerated: `npx supabase gen types typescript --local > src/lib/database.types.ts`, **in Git Bash**, not PowerShell 5.1, whose `>` re-encodes the output (UTF-16, or UTF-8 with a BOM), so `git diff` shows the whole file changed. |
| `src/lib/types.ts` | Re-derived: `Truck`, `Location` (without `created_by`; `source` is `'admin' \| 'owner'` from the generated enum, decision #18), `NewLocation`, `LocationPatch` (`MarkerColor` and `MarkerState` already left in step 1). Comments rewritten for the new schema. |
| `src/lib/db/trucks.ts` | Rewritten for the new schema (functions below). |
| `src/lib/db/locations.ts` | Rewritten (functions below). No delete. |
| `supabase/seed.sql` | The three fixed-UUID trucks without `last_known_*`, plus history relative to `now()` on the two active ones (decision #15). |
| `tests/integration/helpers.ts`, `tests/integration/helpers.test.ts` | `posts` and `geocoding_cache` leave the cleanup and the comments; new helpers (below). |
| `tests/integration/db-locations.test.ts` | Rewritten for the new primitives. |
| `tests/integration/setup.ts` | Comments only: they name `NOMINATIM_BASE_URL` (line 73) and `geocoding.ts` (line 87), both removed in Phase 4. |
| `src/lib/fake-data.ts`, `src/hooks/useMapLibre.tsx`, `src/components/Map/TruckPopup.tsx` | **Type imports and type names only**, from `map-types.ts`. No behaviour change. |
| `README.md` | "What works today": the schema is the new design's; the status line (`README.md:14`, still "Phase 4 of 8 (housekeeping)"); and the "Project status" table (`README.md:89–92`: Phase 2's "schema kept until Phase 5", Phase 4 "🟡 In progress", Phase 5 "⬜ Not started"). |
| `CLAUDE.md` | Step 0: point at this plan. Step 2: the "Target-design rules, enforced from Phase 5" paragraph becomes current rules, and its list of what today's schema breaks goes; and the Hard Rules' grants bullet loses "0001 … grants `service_role` with one blanket `on all tables` grant …; don't copy it", which is false of the baseline. |
| `.claude/context/project-context.md` | Step 7, the end-of-phase reconciliation. |
| `.claude/process-log.md` | Step 5, the Phase 5 retrospective; rows as misses happen. |

### Untouched
`supabase/config.toml` (sign-ups are Phase 7), `src/lib/supabase.ts` (its split is
Phase 7), `src/proxy.ts`, `src/app/*`, `package.json` (no new dependency: `btree_gist`
and `moddatetime` are Postgres extensions).

### Functions and types

**`src/lib/db/trucks.ts`** (db layer)
| Function | Does |
|---|---|
| `getActiveTruckById(id)` → `Truck \| null` | Kept; selects an explicit column list. Phase 7's admin writes use it to check the truck id. |
| `listActiveTrucks()` → `Truck[]` | Active trucks, ordered by name in Swedish order (decision #19); throws past `max_rows` (`assertAllRows`). Read by Phase 6's `/api/live` and Phase 7's checklist. |
| ~~`updateLastKnownPosition`~~ | Removed with its columns. |

**`src/lib/db/locations.ts`** (db layer). Postgres errors propagate unchanged (decision #10). An id that isn't a uuid raises `22P02`, not `null` (probed 2026-10-19, in both db modules); Phase 7's routes check the shape first with the existing `isUuid` (`src/lib/validators/uuid.ts`). The reads without a `limit` select with an exact count and throw through `assertAllRows` (`src/lib/db/complete.ts`) when `max_rows` cuts them (PR #167 rounds 1–3).
| Function | Does |
|---|---|
| `insertLocation(NewLocation)` → `Location` | Insert and return the stored row. Can raise `23P01` or the CHECK violation. Sends only `NewLocation`'s columns, picked at runtime, so a wider object can't write `id` or `cancelled_at` (PR #167 round 1). |
| `updateLocation(id, LocationPatch)` → `Location \| null` | Edits place, label or times of a row that isn't cancelled; `null` when no such row. Can raise `23P01` or the CHECK violation. **Throws before any request on an empty patch** (no key with a defined value): PostgREST answers an empty PATCH by updating no row (probed 2026-10-18: `{}` on an existing truck → `200 []`), so it would return `null` for a row that exists. Sends only `LocationPatch`'s columns, picked at runtime: a key it doesn't list counts as absent, so `{ ...row, label }` can't rewrite `truck_id`, `cancelled_at` or `created_by` (PR #167 round 1). |
| `cancelLocation(id, cancelledAt)` → `Location \| null` | Sets `cancelled_at` where it is still null; `null` when the row is missing or already cancelled. The caller passes the timestamp (decision #10). |
| `findLocationsOverlapping(from, to)` → `Location[]` | Non-cancelled rows with `starts_at < to AND ends_at > from`, all trucks (decision #9), ordered by `starts_at` and then `id`, so rows sharing a start time keep one order (PR #167 round 2). **Throws when more rows match than the API returns** (`max_rows`, 1000 locally): the exact count is compared with the rows received, so a wide window fails loudly instead of losing its latest rows (PR #167 round 1). |
| `listRecentLocationsForTruck(truckId, before, limit)` → `Location[]` | The truck's latest non-cancelled rows with `starts_at < before`, newest `starts_at` first. The caller passes `before` (usually now), so future entries don't fill "recent places" and the clock stays in the service (decision #10). Phase 7's service dedupes them into "recent places". Throws before any request on a `limit` that isn't an integer from 1 to `MAX_ROWS` (1000, `src/lib/db/complete.ts`): above the API's `max_rows` the result would be cut with no error, and at or below it can't be, so there is no count and no second read (decision #14; PR #167 rounds 2–4). |
| ~~`findOverlapping`, `deleteLocations`~~ | Removed: the constraint replaces the first; rows are never deleted. |

Every select names its columns through one `LOCATION_COLUMNS` constant, which leaves
out `created_by` (decision #8). It is **one string literal** (`"id, truck_id, …"`), not
built with `join` or typed `string`: supabase-js infers a select's row type from the
literal text, so a computed string loses that inference and with it `tsc`'s check that
the columns exist (issue #48).

**`src/lib/types.ts`**
- `Truck`: the generated `trucks` row.
- `Location`: the generated `locations` row **minus `created_by`**; `source` is already `'admin' | 'owner'`, because it is an enum (decision #18). It is the shape `LOCATION_COLUMNS` selects. **The db functions return the selected row with no cast**, so `tsc` checks that the select has every key of `Location`. Never `as Location`: a cast also compiles when `LOCATION_COLUMNS` leaves a column out (probed with `tsc --strict` on 2026-10-18: `select("id, truck_id, latitude")` cast `as Location` compiled, and the same row spread into a `Location`-typed literal failed on the 13 missing keys; returned uncast from a function typed with a three-key pick, `select("id, truck_id")` failed on the missing key). `tsc` doesn't see an **extra** column: in the same probe, `select("id, truck_id, latitude, starts_at")` and `select("*")` both compiled returned uncast. So the key-set tests guard that side (decision #8).
- `NewLocation`: `Location` minus `id`, `created_at`, `updated_at`, `cancelled_at` (an insert is never born cancelled), **plus `created_by: string | null`**. Every key, `created_by` and `label` included, is required, so a caller states each value.
- `LocationPatch`: an optional pick of `latitude`, `longitude`, `label`, `starts_at`, `ends_at`.

**`src/lib/map-types.ts`**: types only (decision #1): `type` aliases (an interface there
merged a `declare module` augmentation from another file; with aliases it fails `tsc`
with TS2300, PR #166) and **no imports**. A copy re-derived from `database.types` or
`@/lib/types` still compiles at step 1, while those types keep the old columns. From
step 2 it loses `confidence`, `is_negation` and `last_known_*`, which the map code uses,
so `tsc` fails on it: 12 errors with those four fields deleted (PR #166). So the guard
is `tsc` at step 2, and a re-coupling made between steps 1 and 2 surfaces in step 2's
diff. **Rejected:** a lint rule and a lint test on the file (PR #166 rounds 2–3), which
guarded what `tsc` already catches from step 2 and each needed a fix of its own. `MapTruck` and `MapLocation` are
copies of today's `Truck` and `Location` **with every current field**, not a trimmed
set. The map reads `location.confidence` and `is_negation` and
`truck.last_known_latitude`/`_longitude` (`useMapLibre.tsx`'s `deriveColor` and
`buildMarkerStates`), and `TruckPopup`'s `hours` branches on `ends_at` being null
("Från …"), so `MapLocation` keeps today's nullable `ends_at` where the new `Location`
makes it required. Copying the whole shape keeps step 1 a type-only move.

**`tests/integration/helpers.ts`**
| Helper | Does |
|---|---|
| `seedTruck(name, isActive?)` | Kept; `isActive` (default `true`) seeds an inactive truck in one insert (PR #167 round 2). |
| `seedLocation(truckId, overrides?)` | Inserts a valid location with defaults, so a test states only what it is about, and returns the stored row. `overrides` also takes `id` and `cancelled_at`, and never `truck_id`: a row moved to a seed truck would leak past `resetTables()` (PR #167 round 2). **It throws if exactly one of `starts_at`/`ends_at` is given**: a default for the other would come from the year-2000 window below, giving `23514` or a window spanning decades. A call without `starts_at`/`ends_at` gets a window on a day no earlier call used: day *n* after 2000-01-01, *n* a counter in the module. So two default calls on one truck don't raise `23P01`; a test that passes its own window keeps it after 2020 (a rule for the tests; the counter would need 7,000-odd default calls in one run to get there). |
| `FIXTURE_PREFIX` (exported), `seedDailyLocations(truckId, firstDay, count)`, `seedTrucks(name, count)`, `readLocation(id)`, `keysOf(row)`, `FIXTURE_PLACE`, `dayWindow(dayMs)` | One-request bulk inserts (for the `max_rows` tests), a stored row read back, a row's sorted keys for the key-set tests, and the default place and 09:00–12:00 UTC window every location helper uses. Shared rather than written in each test file (PR #167 round 2). |
| `anonClient()` | A supabase-js client with the anon key. Not `supabaseClient` from `supabase.ts`: `CLAUDE.md` keeps that one for browser Auth, and Phase 7 splits the file. |
| `createFixtureAuthUser()` | The **only** way a test creates an auth user: `supabaseAdmin.auth.admin.createUser` with an email carrying the fixture prefix, so `resetTables()` finds it even when the test fails before its own cleanup. Returns the user id. Step 4's bare authors (no `users` row) come from it directly. |
| `signedInClient()` | Creates a prefixed auth user with `createFixtureAuthUser()`, then its `users` row with `supabaseAdmin.from("users").insert` (the Auth admin API doesn't write `public` tables); signs in; returns an `authenticated` client and its user id. |
| `resetTables()` | Also removes fixture `users` rows and fixture auth users. They are found through the admin API, not PostgREST (`public.users` has no email, and `auth` isn't exposed): `auth.admin.listUsers({ page, perPage })`, **every page until a short one** (one page holds 50 by default, and leaked fixtures from interrupted runs are the case cleanup exists for), filtered in JS with `startsWith` on the email prefix; their ids give the `users` rows. Children first: `users` rows before trucks (`users.truck_id` references `trucks`, decision #7) and before their auth users (`users.id` references `auth.users`). ⚠ Today's version removes fixture trucks in batches of 100 in a loop, throws if a pass removes fewer than it found, and returns when no fixture truck is left (`if (fixtureTruckIds.length === 0) return`; batched since PR #167 round 3). The user cleanup must run before that loop, or a test that creates a user and no truck leaks the user. |

⚠ `resetTables()` removes only `itest-fixture-` trucks and their children, so the
seed's history survives a test run, as intended. A test that counts rows must scope to
its own fixture truck, or the seed leaks into the count.

---

## Steps

Strict order. Steps 0–5 and 7 are one PR into `dev` each; step 6 is one issue and PR
per follow-up the retrospective opens, which may be none.

0. **This plan.** The plan file, and `CLAUDE.md` pointing at it as the current plan.
1. **Decouple the map from the schema types.** Create `src/lib/map-types.ts`; switch
   `fake-data.ts`, `useMapLibre.tsx` and `TruckPopup.tsx` to it; **move** `MarkerColor`
   and `MarkerState` out of `types.ts` into it (no copy left behind). `types.ts` keeps
   `Truck`, `Location` and `NewLocation` until step 2. A type-only move. Gates
   green and a browser check of `/map` (basemap, markers, a popup), because it touches
   map code. *First because* step 2 regenerates the types, and the map would otherwise
   break `tsc` in step 2's diff.
2. **Schema reset.** Delete `0001`–`0006`; write `0001_baseline.sql`;
   `npx supabase db reset`; regenerate `database.types.ts`; re-derive `types.ts`; rewrite
   `db/trucks.ts` (`getActiveTruckById`, `listActiveTrucks`) and `db/locations.ts`
   (`insertLocation`, `updateLocation`, `cancelLocation`, `findLocationsOverlapping`,
   `listRecentLocationsForTruck`, `LOCATION_COLUMNS`); rewrite `seed.sql`, `helpers.ts`
   (`seedLocation`; `posts` and `geocoding_cache` out of `resetTables`),
   `helpers.test.ts`, `db-locations.test.ts`; create `db-trucks.test.ts`. Record open
   decisions 3 and 5. The docs this makes stale ride along: `CLAUDE.md`'s
   target-design paragraph and its Hard Rules sentence about `0001`'s blanket grant,
   `README.md`'s status line, "What works today" and "Project status" table,
   `setup.ts`'s comments.
   *One PR because* it is the smallest unit with green gates (decision #2).
3. **Constraint tests.** `tests/integration/schema.test.ts`: overlap → `23P01`; a
   cancelled row doesn't block; back-to-back windows are allowed; `ends_at = starts_at`
   and `ends_at < starts_at` are rejected with **`23514`**; a NULL in each NOT NULL
   column of decision #17 except the `id` primary keys is rejected with `23502`
   (`source` included: an enum column accepts NULL, so only NOT NULL stops it; a primary key
   implies NOT NULL and can't drop it for a control: "column "id" is in a primary
   key", probed 2026-10-18); a bad `source` value is rejected with `22P02` **and a
   message naming `location_source`** (decision #18): `22P02` alone also comes from
   any malformed uuid (probed: `'not-a-uuid'::uuid` → `22P02`). Its control is
   `alter table locations alter column source type text`, after which the bad value
   inserts (probed 2026-10-18);
   `updated_at` moves on an edit and on a cancel (decision #5) and `created_at`
   doesn't. (The two `created_by` cases need an auth user, so they are step 4's.)
   Each case that expects an error asserts its **SQLSTATE**, not only that an error
   came back: with the CHECK dropped, `ends_at < starts_at` still fails, with `22000`
   from the constructor of `tstzrange(starts_at, ends_at)` in the exclusion constraint
   (decision #4), so an "any error" test stays green. Each case with a negative
   control, recorded in the PR. **Each control is undone with `npx supabase db reset`**,
   not by re-adding the constraint: a NOT NULL control lets in a row `resetTables()`
   can't find (a `NULL` `truck_id`, or a truck with no name and so no fixture prefix),
   and `set not null` over it fails ("column … contains null values", probed
   2026-10-18).
4. **RLS and grant tests.** `anonClient()`, `signedInClient()` and auth-user cleanup in
   `resetTables()` (with `helpers.test.ts` cases for the new cleanup);
   `tests/integration/rls.test.ts`. With the auth fixtures in place, `schema.test.ts`
   gains step 3's two `created_by` cases (decision #5): `updated_at` **doesn't** move
   when deleting an auth user sets its rows' `created_by` to NULL (control: the
   trigger without its `WHEN` clause; the author is a bare auth user from
   `createFixtureAuthUser()`, with no `users` row, because `users.id → auth.users` is NO
   ACTION and its row would block the delete: `confdeltype = 'a'` on today's
   `users_id_fkey`, read 2026-10-18), and **does** move on an edit that also sets a
   NULL `created_by` to a user (control: round 6's `old … is not distinct from new …`
   clause). What each case sees, probed in rolled-back
   transactions on 2026-10-18:
   - no grant: `42501` "permission denied for table …", with a hint listing every
     missing privilege: `GRANT SELECT ON …`, `GRANT INSERT ON …`, and for a filtered
     UPDATE or DELETE `GRANT SELECT, UPDATE ON …` / `GRANT SELECT, DELETE ON …` (the
     filter needs SELECT too);
   - a grant and no RLS policy: SELECT, UPDATE and DELETE affect no rows; INSERT gets
     `42501` "new row violates row-level security policy", with no hint;
   - an UPDATE or DELETE grant without SELECT: a filtered request still gets "permission
     denied", with the hint `GRANT SELECT ON …`.

   So `42501` alone can't tell a missing grant from a wrong one. Each case asserts the
   code **and that the hint's privilege list contains that operation's own privilege**
   (SELECT, INSERT, UPDATE, DELETE), which only a missing grant of it produces. The one policy test (own `users` row)
   asserts rows. Record open decision 4.
5. **Phase 5 retrospective**, by the milestone-retrospective procedure in
   `.claude/process-log.md` ("How to use it").
6. **Follow-up issues** the retrospective opens, if any.
7. **Reconcile `project-context.md`** (the end-of-phase task).

   Steps 5–7 are ordered, blocked and closed as that procedure's part 6 says; this plan
   doesn't restate it. Step 7's content: it covers Part 1's "Database", "Modules kept on
   purpose" (its `types.ts` row, `project-context.md:152`, describes "CHECK columns
   narrowed by hand (e.g. `source`)", which decision #18's enum removes), "Folder
   structure", "Tests and gates" and the Roadmap row; Part 3's
   "Component structure" example, which imports `MarkerState` from `@/lib/types`
   (`project-context.md:501`; it moves to `map-types.ts` in step 1); Part 2's
   "Explicit GRANTs" bullet, whose "Supabase doesn't auto-expose new tables to the API
   roles" leaves out the default privileges decision #6 records; and it carries
   forward the decisions that outlive their phase: this plan's (#10's db-layer rules
   are the likely one) and **Phase 4's #14 and #15**, which were added after Phase 4's
   reconciliation merged, with the tooling they and #149/#150 brought
   (`scripts/claims.sh`, `process-log.sh add`, the values block, the `Caught by`
   groups). Two hosted checks Phase 6 runs, so the reconciliation names them where Phase 6
   will read them: decision #19's `sv-SE-x-icu` collation, and the hosted Data API's
   `max_rows` being at least `MAX_ROWS` (`src/lib/db/complete.ts`): it is set in the
   dashboard, not from `config.toml`, and below `MAX_ROWS` `listRecentLocationsForTruck`
   returns a cut result with no error (PR #167 round 5).

---

## Rationale

### #1 — The fake-data map gets frozen, hand-written types
`fake-data.ts`, `useMapLibre.tsx` and `TruckPopup.tsx` type their data with `Truck` and
`Location` from `types.ts`, which derive from the generated schema types (issue #48).
Regenerating them drops `last_known_*` and `confidence`, and `tsc` fails on the map.
`map-types.ts` holds today's shapes by hand until Phase 6 replaces the map's data source
and deletes the file. **Rejected:** keeping the old columns in the new schema (the
schema would describe the old design for another phase), and pulling Phase 6's map
rewrite forward (the map would change in a schema phase, against the Out of Scope).

### #2 — Steps 1–4 split this way
Step 2 can't be split further with green gates: squashing without regenerating leaves
the types disagreeing with the database, and regenerating without the db-layer rewrite
fails `tsc` on `last_known_*` and `expires_at`. The constraint tests (step 3) and the RLS
tests (step 4) follow as their own PRs, to keep each reviewable; recent PRs took two or
three review rounds each (PRs #154, #156, #157). Step 4 also isolates the most delicate new test code,
which creates and deletes auth users. **Rejected:** folding steps 3–4 into step 2 (about
900 lines in one PR). The cost of the split is that the schema's security properties go
untested for two PRs; accepted because nothing is deployed and no route reads the
database until Phase 6.

### #3 — Squash into `0001_baseline.sql`
No hosted database exists, so only local Docker databases have applied `0001`–`0006`,
and `npx supabase db reset` rebuilds them. A baseline written fresh is readable as the
schema; today's `0001` warns that it isn't the current schema and must be read with
`0002`/`0003`. **Rejected:** a `0007` that drops the old tables (six files of dead
history stay as the record of the schema), and a timestamp name (mixes two naming
conventions in one folder).

### #4 — The overlap constraint, and why the CHECK is part of it
```sql
EXCLUDE USING gist (truck_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  WHERE (cancelled_at IS NULL)
```
`tstzrange`'s default bounds are `[)`, so a window ending at 14:00 and one starting at
14:00 don't overlap. `CHECK (ends_at > starts_at)` is not only data hygiene: with
`ends_at = starts_at` the range is empty, and an empty range overlaps nothing, so such a
row would pass the constraint. Step 3 tests that case. With `ends_at < starts_at` the
CHECK isn't what stops the row by itself: building `tstzrange(starts_at, ends_at)` for
the constraint raises `22000` ("range lower bound must be less than or equal to range
upper bound", probed 2026-10-18). With both in place the CHECK's `23514` is the one the
step 3 test asserts. A violation of the constraint raises `23P01`;
Phase 7's service maps it to 409 "överlappar". Cancelled rows are outside the
constraint, so a cancelled window can be re-entered.

### #5 — `updated_at` via `moddatetime`; both extensions in `extensions`
```sql
create extension if not exists btree_gist  schema extensions;
create extension if not exists moddatetime schema extensions;
create trigger locations_updated_at
  before update on locations
  for each row
  when (new.created_by is not null or old.created_by is null)
  execute procedure extensions.moddatetime (updated_at);
```
**Every UPDATE except one that clears `created_by`.** `created_by … on delete set
null` (decision #8) runs an UPDATE on every row the deleted user wrote, and a plain
`before update` trigger moves their `updated_at`, so the popup would say "Uppdaterad
<now>" on entries nobody edited. The `WHEN` clause skips only an UPDATE that takes
`created_by` from a value to NULL, which is what the `SET NULL` does; an edit,
including one that attributes a row (NULL → a user), still moves it. Probed in
rolled-back transactions (2026-10-18), on a stand-in parent table: with a plain
trigger the `SET NULL` moved `updated_at`; with this clause it didn't, and a plain
edit, an edit of an unattributed row, and an attribution with a label edit each did.
**The limit:** the clause skips *any* UPDATE that clears `created_by`, not only the
FK's, so an edit that also clears it leaves `updated_at` stale. The db layer never
writes `created_by` on an update (`updateLocation` sends only `LocationPatch`'s
columns, picked at runtime; `cancelLocation` sets `cancelled_at` only), so only hand-written SQL can do that, and **SQL that clears
`created_by` while editing sets `updated_at = now()` itself**.
**Rejected:** `when (old.created_by is not distinct from new.created_by)` (PR #159
round 6), which also skips that attribution-with-edit (probed: `updated_at` didn't
move); and a column list (`before update of label, cancelled_at, …`), which has to be
extended by hand whenever `locations` gains a column, or edits to that column silently
stop moving `updated_at`.
No custom function lands in `public`, so no function of ours needs its `search_path`
pinned, and neither extension's functions land there either (the stack keeps
`pgcrypto`, `uuid-ossp` and others in `extensions` already). Both forms were probed
in a rolled-back transaction on the local stack (2026-10-18): neither extension was
installed before, both created in `extensions`, the trigger was accepted, and a GiST
exclusion constraint on `uuid` and `tstzrange` raised its conflict on a second
overlapping insert. **Rejected:** a hand-written plpgsql function, which is more to
own. A cancellation moves `updated_at` too; a cancelled row never reaches the map, so
that shows nowhere.

### #6 — Grants: revoke, then grant exactly the table; no `service_role` policies
For each table: `revoke all … from anon, authenticated, service_role`, then the grants
in `project-context.md`'s "RLS and grants" table (`authenticated` SELECT on `users`;
`service_role` SELECT, INSERT, UPDATE, DELETE on each table, granted per table). The
revoke makes the result independent of the stack's default privileges, and they do
grant more than that table: on the local stack, `pg_default_acl` gives `anon`,
`authenticated` and `service_role` TRUNCATE, REFERENCES, TRIGGER and MAINTAIN
(`Dxtm`) on every new table `postgres` creates in `public`, and on today's `locations`
`role_table_grants` shows `anon` holding TRUNCATE, REFERENCES and TRIGGER (checked
2026-10-18). `service_role`
is in the revoke so its grant is exactly the four, too. No `service_role` policies,
because `service_role` bypasses RLS; `0001`'s service-role policies were dead code;
step 4's tests are the evidence. The policy that remains: `users` SELECT for
`authenticated` where `(select auth.uid()) = id`.

### #7 — Foreign keys stay `NO ACTION`; no cascade
`locations.truck_id` and `users.truck_id` reference `trucks` without `ON DELETE
CASCADE`. Deleting a truck that has history then fails (`23503`, probed on today's
schema 2026-10-18), so only the takedown removes history: in one transaction, delete
the truck's locations, clear or delete any `users` row whose `truck_id` points at it
(none until the Owners phase), then delete the truck. Phase 8 writes the procedure.
**Rejected:** cascade, which turns any future "delete truck" action into a silent wipe of
a truck's history.

### #8 — `created_by` is nullable and never selected
`created_by uuid references auth.users (id) on delete set null`. Nullable because seed
rows and hand-written SQL have no author; `NewLocation` still requires the key, so a
caller states it. `LOCATION_COLUMNS` leaves it out, so Phase 6's `/api/live` can't leak
it by reusing the constant (the explicit-column rule in `CLAUDE.md`). **`Location` leaves
it out too**, so the type is exactly what `LOCATION_COLUMNS` selects. Returning the
row uncast (`types.ts` section above) makes `tsc` check that the select has every key
of `Location`; with `created_by` in `Location`, that would fail `tsc`, where an `as`
cast would hide a key the select never returns, typed `string | null` and `undefined`
at runtime. **The reverse isn't checked:** if `LOCATION_COLUMNS` gains `created_by`
(or a `*`), the row still assigns to `Location`, since TypeScript has no excess-property
check on a value that isn't an object literal. The key-set tests (AC) are the only
guard there. `NewLocation` adds `created_by` back for
inserts. An admin-only column list, and a type to match, are added when something
needs to read the author.

### #9 — One overlap query for the live window and the checklist
`findLocationsOverlapping(from, to)` returns non-cancelled rows overlapping `[from, to)`.
Phase 6's live read passes `[now, now + 1 day)`; Phase 7's checklist passes the same
weekday's Stockholm day N weeks back. The look-back is the caller's parameter, so open
product decision #2 (checklist look-back) stays with Phase 7 instead of blocking this
phase. **Rejected:** a dedicated checklist query (it would bake in a look-back nobody has
chosen).

### #10 — The db layer finds and mutates; it decides nothing
Errors propagate unchanged, so a `23P01` reaches the service with its code. No function
reads the clock: `cancelLocation` takes `cancelledAt`, the overlap query its window and
`listRecentLocationsForTruck` its `before`, so time stays in the service (`CLAUDE.md`,
"Time"). PostgREST can't send
`now()` in an update anyway. No function deletes; ended and cancelled are filters.

### #11 — Truck writes wait for Phase 7
Truck insert and update arrive with the truck CRUD screen that uses them, so their shape
follows the form instead of a guess. Phase 5 writes the two truck reads Phases 6 and 7
name (`listActiveTrucks`, `getActiveTruckById`).

### #12 — `label` is nullable
A pin dropped by tapping the map may have no name. The popup's handling of a missing
label is Phase 6's.

### #13 — Coordinates: `float8`, no CHECK in the database
The Gothenburg bounding box is checked by Phase 7's validator (`isInGothenburg` in
`src/lib/geo.ts`), which also catches swapped latitude and longitude. A CHECK in the
database would be a second copy of the box, free to drift from the first.

### #14 — Indexes: the constraint's, plus one per read
The exclusion constraint's GiST index on `(truck_id, tstzrange(…))` serves overlap
checks for one truck, but can't return rows in `starts_at` order. So two partial
btrees, each `WHERE cancelled_at IS NULL`, one per read:
- `(ends_at)` for the live window, where most rows have ended;
- `(truck_id, starts_at desc)` for `listRecentLocationsForTruck`, which can then read
  `limit` rows off the index instead of sorting a truck's whole history (which is never
  deleted, so it only grows).

About 22k rows a year in total (`project-context.md`), so nothing more until a measured
query needs it. Today's `locations_truck_starts` (created in `0001`, reshaped under the
same name by `0006`) and `0001`'s `locations_expires` go.

### #15 — Seed history is relative to `now()`
`seed.sql` builds four weeks of past rows, in Stockholm local times, with
`generate_series`, on the two active fixed-UUID trucks. **Vintervilan, the inactive
one, gets no rows**: it is the seed's rejection case ("INACTIVE — rejection tests" in
`seed.sql`), and `findLocationsOverlapping` doesn't filter on `is_active` (open
decision 6), so its rows would surface in the live window and the checklist. The
series covers the 28 days **before today's Stockholm date and stops at yesterday**.
"The same weekday last week" then exists after any reset. **Plus one row on an active
truck from `now() - interval '1 hour'` to `now() + interval '12 hours'`**. Because the
history stops at yesterday, that row can't overlap a history row. A series that
included today would put an 11–14 row on the same truck, which `[now − 1 h, now + 12 h)`
overlaps for any reset before 15:00: `23P01`, and `db reset` failing by time of day.
The spanning row means the live window `[now, now + 1 day)` holds a row for 12 hours
after a reset at any time of day. A row at fixed Stockholm hours ("today 11–14") would
be over by the afternoon, and the live window would come back empty. **Rejected:**
fixed dates, which fall out of the look-back window as the weeks pass. Open decision 3
covers DST.

### #16 — `trucks` and `users` columns unchanged, minus `last_known_*`
`trucks`, every column `0001` and `0003` left except `last_known_*`: `id` (uuid,
`gen_random_uuid()`), `name` not null, `instagram_handle` unique and nullable,
`cuisine_type` and `description` nullable text, `is_active` and `created_at` not null
with their defaults (`project-context.md`'s Data model lists the same). `users`:
`id` references `auth.users`, `truck_id` nullable, `is_admin` and `created_at` not null.
Nothing in the target design changes them; owner claim columns are the Owners phase's.
**Amended by #19:** `name` gains the Swedish collation.

### #17 — Every column's nullability is stated; NOT NULL unless named here
Every column of the three tables is NOT NULL, except `trucks.instagram_handle`,
`cuisine_type` and `description`; `users.truck_id`; and on `locations`, `label`
(decision #12), `cancelled_at` (null means live) and `created_by` (decision #8). On
`locations` that makes `truck_id`, `latitude`, `longitude`, `starts_at`, `ends_at`,
`source` (default `'admin'`), `created_at` and `updated_at` NOT NULL. **`source` in
particular:** an enum column accepts NULL like any other (probed 2026-10-18: NOT NULL
is what raised `23502`), and the generated type would then be `'admin' | 'owner' |
null`. `0001` left NOT NULL off columns and `0002`/`0003` fixed it column by column;
the baseline states every column's nullability once.

**Defaults, stated with it.** `NewLocation` omits `id`, `created_at` and `updated_at`,
so `insertLocation` fails with `23502` without their defaults (probed 2026-10-18: an
omitted NOT NULL column with no default, primary key included). The rest let the seed
and hand-written SQL leave them out. Every `id` `gen_random_uuid()` except `users.id`
(it is the auth user's); every `created_at`, and `locations.updated_at`, `now()`;
`trucks.is_active` `true`; `users.is_admin` `false`; `locations.source` `'admin'`.
(`0001` gives the same defaults to `id`, `created_at`, `updated_at`, `is_active` and
`is_admin`. Its `id` columns are primary keys, so NOT NULL; the other four it left
nullable. Its `locations.source` has no default, and its values were the old lanes.)

### #18 — `source` is a Postgres enum, not text with a CHECK
`create type location_source as enum ('admin', 'owner')`, and `locations.source
location_source not null default 'admin'`. A CHECK carries no type into the generated
types, so a text `source` arrives as `string`, and every db function would have to
narrow it by hand; an enum is generated as `'admin' | 'owner'`, so `Location` derives
with no narrowing and the db functions return rows uncast (`types.ts` section). A bad
value raises **`22P02`** ("invalid input value for enum"), not `23514` (probed
2026-10-18). **Rejected:** text with `CHECK (source in ('admin', 'owner'))` (PR #159
round 8), which needed a cast or a typed spread in each of five functions, and any of
them slipping back to `as Location` loses `tsc`'s check of the select. The cost
accepted: an enum value can be added (`alter type … add value`) but not easily
removed; `'owner'` is already planned, so the list isn't expected to shrink.

### #19 — `trucks.name` sorts in Swedish (added in PR #167 round 2)
`name text collate "sv-SE-x-icu" not null`. The stack's default collation sorted
`Åkes < Alpha < Ärtsoppan < burgare < Öl < Zebra`, Å and Ä as A; with `sv-SE-x-icu`,
`Alpha < burgare < Zebra < Åkes < Ärtsoppan < Öl` (checked 2026-10-19, and the collation
exists on the local stack's Postgres 17.6). The UI is Swedish-only, so `listActiveTrucks`'s
"ordered by name" means Swedish order wherever it is read. `db-trucks.test.ts` pins it;
without the collation it fails. **Rejected:** sorting in Phase 7's service with
`Intl.Collator('sv')`: every reader of `listActiveTrucks` would have to remember to.
**Open:** whether a hosted project has `sv-SE-x-icu` is Phase 6's to check, with the
other hosted checks; a missing collation fails the `create table` (`42704`, probed
locally 2026-10-19 with a made-up `xx-XX-x-icu`).

---

## Acceptance Criteria

**Schema (steps 2–4)**
- [ ] `ls supabase/migrations` lists only `0001_baseline.sql`.
- [ ] `npx supabase db reset` exits 0 and applies the migration and the seed.
- [ ] `select table_name from information_schema.tables where table_schema = 'public'`
  returns exactly `trucks`, `locations`, `users`.
- [ ] `locations` has exactly the columns of `project-context.md`'s Data model, with
  `information_schema.columns.is_nullable` matching decision #17 for every column of
  all three tables (only `label`, `cancelled_at` and `created_by` nullable on
  `locations`); none of `confidence`, `parser_confidence`,
  `source_confidence`, `is_negation`, `post_id`, `address_raw`, `address_geocoded`,
  `expires_at` exists (`information_schema.columns`).
- [ ] `pg_class.relrowsecurity` is true for all three tables.
- [ ] `select extname, extnamespace::regnamespace from pg_extension where extname in ('btree_gist', 'moddatetime')`
  shows both in `extensions`.
- [ ] `pg_indexes` for `locations` shows the exclusion constraint's GiST index and the
  two partial btrees of decision #14, and no other index besides the primary key.
- [ ] `select relname, relacl from pg_class where relname in ('trucks', 'locations', 'users') and relnamespace = 'public'::regnamespace`
  shows, besides the owner: no entry for `anon`; `authenticated=r` on `users` only;
  `service_role=arwd` (SELECT, INSERT, UPDATE, DELETE, nothing else) on all three.
  (`relacl` rather than `role_table_grants`, which doesn't list MAINTAIN.)
- [ ] `schema.test.ts` covers each case in step 3, asserting the SQLSTATE (`23P01`,
  `23514`, `23502`, `22P02`) of each case that expects an error (the `22P02` case
  also its message's `location_source`), and the PR records a negative control per
  case (constraint dropped or altered locally, or `source` altered to `text`; test
  red; restored with `npx supabase db reset`).
- [ ] `schema.test.ts` also covers step 4's two `created_by` cases: deleting an auth
  user leaves `updated_at` on its rows unchanged, and an edit that sets a NULL
  `created_by` to a user moves it; each case's negative control (step 4) turns it red.
- [ ] `rls.test.ts` shows, each refusal asserted as `42501` **plus a hint whose
  privilege list contains that operation's privilege** (step 4):
  - anon and `authenticated` are refused SELECT, INSERT, UPDATE and DELETE on `trucks`
    and `locations`, each UPDATE and DELETE with a filter (`.eq("id", …)`). Without
    one, the local API answers `21000` ("DELETE requires a WHERE clause") before any
    permission check (probed with the anon key on 2026-10-18: unfiltered → `21000`,
    filtered → `42501`);
  - anon is refused SELECT, INSERT, UPDATE and DELETE on `users`;
  - `authenticated` reads its own `users` row and not another's (rows, filtered by the
    policy); is refused an INSERT into `users`, including its own id with
    `is_admin = true` (the other self-escalation path); is refused UPDATE of
    `is_admin` or `truck_id` on its own row, which is unchanged afterwards (read with
    `service_role`); is refused DELETE of its own row, which still exists afterwards;
  - `service_role` reads and writes all three.

  **Negative controls, one per operation**, each a temporary grant to the role under
  test that turns its test red: `grant select` (the SELECT test gets an empty list; on
  `users` that test and its control are anon's, since `authenticated` may read its own
  row), `grant insert` (the INSERT test gets the RLS message, no hint),
  `grant update` and `grant delete` (their tests get the hint `GRANT SELECT ON …`,
  which lacks UPDATE or DELETE; except `authenticated` on `users`, which already holds
  SELECT there, so the write gets no error at all and matches no row, as "a grant and no
  RLS policy" in step 4 predicts).

**Types and db layer (step 2)**
- [ ] Re-running `npx supabase gen types typescript --local > src/lib/database.types.ts`
  in Git Bash leaves `git diff --exit-code src/lib/database.types.ts` clean.
- [ ] `grep -rnE "last_known|confidence|expires_at|is_negation|post_id|posts|geocod" src/lib/db src/lib/types.ts src/lib/database.types.ts tests/integration supabase/migrations supabase/seed.sql`
  → no hits. (Not all of `supabase/`: the gitignored CLI cache
  `supabase/.temp/pgdelta/*.json` holds `expires_at` 72 times per file, checked
  2026-10-18.) Old-design names remain only in `map-types.ts`, `fake-data.ts`,
  `useMapLibre.tsx` and `TruckPopup.tsx`.
- [ ] ``grep -rnE "\.select\(\s*\)|\.select\(\s*[\"'\`][^\"'\`]*\*|\.delete\(" src/lib/db | grep -vE "^[^:]+:[0-9]+:\s*(//|\*|/\*)"``
  → no hits. (`-r`: without it grep stops at "Is a directory", exit 2. The pattern was
  checked on 2026-10-18 against a scratch file: it matches `.select()`, `.select( )`,
  `select("*")`, `select('*')`, ``select(`*`)``, `select( "*" )`, `select("id, *")` and
  `.delete()`, not `.select(LOCATION_COLUMNS)` or `.select("id, truck_id")`. The second
  grep drops comment lines: today's code gives 5 hits without it, one of them the
  comment at `locations.ts:32`, and 4 with it.)
- [ ] `LOCATION_COLUMNS` does not contain `created_by`, and **`db-locations.test.ts`
  and `db-trucks.test.ts` assert that the keys of a row each function returns equal a
  list written out in the test** (not derived from a type, which would grow with the
  table). The greps above read only what is written inside `.select(…)`, so a `"*"` in
  a column constant passes them, and a one-line grep for one misses a constant wrapped
  onto its next line (tried on a scratch file, 2026-10-18). The key-set tests see what
  the select returns, and a new column the constant doesn't name can't reach them.
- [ ] Each function exported by `db/trucks.ts` and `db/locations.ts` has an integration
  test, including: `insertLocation` and `updateLocation` let a `23P01` through with its
  code; `cancelLocation` returns `null` for an already-cancelled row; `updateLocation`
  throws on an empty patch (`{}`, and one whose keys are all `undefined`).
- [ ] **A manual check, run right after `npx supabase db reset` and recorded in step 2's
  PR; never an integration test**, since its result depends on how long ago the local
  database was reset: `findLocationsOverlapping(now, now + 1 day)` returns at least
  one seed row, and the Stockholm day one week earlier returns at least one, each on
  an active truck; no seed row is on Vintervilan (decision #15). (Decision #15 makes
  it hold for 12 hours after a reset, at any time of day.)
- [ ] Every seed row in the four weeks of history starts and ends at the same
  Stockholm wall-clock times, checked on a series that crosses a DST change (open
  decision 3).

**Map (step 1)**
- [ ] The diffs of `fake-data.ts`, `useMapLibre.tsx` and `TruckPopup.tsx` change only
  type imports and type names.
- [ ] `map-types.ts` imports nothing and declares its types as `type` aliases, not
  interfaces.
- [ ] `/map` checked in a real browser (basemap, markers, a popup), noted in the PR.

**Gates (every step)**
- [ ] `npx tsc --noEmit`, `npm run lint`, `npm run test:all`, `npm run build` exit 0,
  read unpiped.
- [ ] Each PR records both vitest projects' file and test counts. Integration: 2 files
  today, 5 at the end (open decision 7).

**Docs (step 2, under the sweep)**
- [ ] `CLAUDE.md` no longer has the "Target-design rules, enforced from Phase 5"
  paragraph listing what today's schema breaks; the Locations and anon-SELECT rules
  read as current; the Hard Rules' grants bullet no longer describes `0001`'s blanket
  `service_role` grant.
- [ ] `README.md`'s "What works today" describes the new schema, its status line names
  Phase 5, and its "Project status" table shows Phase 4 done, Phase 5 in progress, and
  no Phase 2 schema kept.

**Closing**
- [ ] The closing steps of the milestone-retrospective procedure are done: the Phase 5
  retrospective (step 5), its follow-ups merged (step 6), and the `project-context.md`
  reconciliation merged (step 7).

---

## Open Decisions

1. ~~**Default privileges on new tables.**~~ → **answered in PR #159's review round 1:**
   yes. `pg_default_acl` on the local stack gives `anon`, `authenticated` and
   `service_role` TRUNCATE, REFERENCES, TRIGGER and MAINTAIN on new `public` tables
   (decision #6, which now revokes from all three).
2. ~~**`moddatetime` locally.**~~ → **answered in PR #159's review round 2:** both
   extensions install into `extensions` on the local stack and the trigger form works
   (decision #5's probe). Step 2 still runs it for real; a hosted project is Phase 6's
   to check.
3. ~~**Seed times across DST.**~~ → **answered in step 2 (#161):** `seed.sql` builds
   the times from a `date` (`(now() at time zone 'Europe/Stockholm')::date - n`, `n` in
   1–28). The same expression with `now()` replaced by `timestamptz '2026-11-05
   12:00+01'` covers 2026-10-08 … 11-04, across the 10-25 change: all 28 rows start
   11:00 and end 14:00 Stockholm (09:00Z before, 10:00Z after). With a `timestamptz`
   series in place of the date, the starts came out 23:00 and 00:00. The PR records the
   query. The question as planned:
   Rows at 11:00–14:00 Stockholm time over four weeks must
   stay at 11:00–14:00 across a DST change. The seed's real window holds a DST change
   only in the four weeks after one (the next is 2026-10-25, a week after this plan
   was written), so a check run on today's seed can pass with no change inside it.
   Build the times as `(d::date + time '11:00') at time zone 'Europe/Stockholm'`. The
   cast matters: `generate_series` over dates yields `timestamptz`, and without
   `::date` the expression returns a `timestamp` of 13:00, then 12:00 after the
   change, which a `timestamptz` column reads as UTC (probed 2026-10-18; with the cast:
   09:00Z, then 10:00Z, 11:00 Stockholm on both sides). Check the expression on
   a fixed anchor that puts a change inside the series (e.g. `now()` replaced by
   `timestamptz '2026-11-05 12:00+01'`): every row's Stockholm start must be 11:00.
4. **Auth fixtures for `rls.test.ts`.** Does local Auth accept
   `admin.createUser({ email_confirm: true })` and a password sign-in, or does the test
   need OTP? Delete order: the `users` row, then the auth user (`users.id` references
   `auth.users` with no cascade). Fixture users are matched in JS with `startsWith` on
   the email (`resetTables()` above), so the prefix needs none of the escaping
   `FIXTURE_PREFIX` needs for its server-side `like`. **The hint the RLS tests assert**
   (`GRANT … ON …`) was seen on the local stack's Postgres 17.6; whether it comes from
   upstream Postgres or Supabase's image isn't checked. If an upgrade drops it, the
   tests fail loudly rather than pass, and step 4 then asserts the message instead.
5. ~~**How `23P01` arrives through supabase-js.**~~ → **answered in step 2 (#161):**
   yes. `insertLocation` and `updateLocation` reject with an error whose `code` is
   `"23P01"` (`db-locations.test.ts`, one case each; wrapping the error in
   `insertLocation` turns its case red). Phase 7's 409 mapping can read `code`.
6. **`is_active` in the live read.** `findLocationsOverlapping` doesn't filter by the
   truck's state. Whether Phase 6 filters in its service or adds a joined query is
   Phase 6's call; this phase only records that the primitive doesn't.
7. **Integration file count.** The AC expects 5 files at the end. If step 3 or 4
   splits or merges a file, that PR records the new count and why.

Product decisions #1 (retention), #3 (default times) and #4 (app name) stay open for
Phases 7–8. This plan's schema doesn't wait on them: retention would filter or delete
rows, and the other two are UI text and form defaults.
