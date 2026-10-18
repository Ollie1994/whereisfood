# Phase 5 — Schema reset

**Planned:** 2026-10-18 · **Status:** draft
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

A single squashed migration creates the target schema (`trucks`, `locations`, `users`
with the overlap exclusion constraint, `CHECK (ends_at > starts_at)`, an `updated_at`
trigger, RLS and an explicit per-table GRANT, and no anon access to `trucks` or
`locations`), and the generated types, `seed.sql`, `db/trucks.ts`, `db/locations.ts` and
the integration tests all match it, with all four gates green and the fake-data map
unchanged.

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
| Owner columns on `trucks`, the claim flow, writes with `source = 'owner'` (the column and its CHECK exist; nothing writes `'owner'`) | Owners phase |
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
| `supabase/migrations/0001_baseline.sql` | `btree_gist` and `moddatetime`, both in the `extensions` schema; `trucks`, `locations`, `users`; the exclusion constraint, `CHECK (ends_at > starts_at)` and the `source` CHECK; the `updated_at` trigger; two partial indexes; RLS and per-table grants (decisions #3–#8, #12–#14, #16). |
| `src/lib/map-types.ts` | The fake-data map's **frozen, hand-written** types: `MapTruck`, `MapLocation` (with `last_known_*`, `confidence` and the old `source` lanes), `MarkerColor`, `MarkerState`. Deleted in Phase 6 (decision #1). |
| `tests/integration/schema.test.ts` | Constraint, CHECK and trigger tests (step 3). |
| `tests/integration/rls.test.ts` | RLS and grant tests (step 4). |
| `tests/integration/db-trucks.test.ts` | Tests for the rewritten `db/trucks.ts`. |
| `.claude/plans/phase-5-schema-reset.md` | This plan. |

### Modify
| File | Change |
|---|---|
| `src/lib/database.types.ts` | Regenerated: `npx supabase gen types typescript --local > src/lib/database.types.ts`. |
| `src/lib/types.ts` | Re-derived: `Truck`, `Location` (without `created_by`; `source` narrowed to `'admin' \| 'owner'`), `NewLocation`, `LocationPatch`. `MarkerColor` and `MarkerState` move to `map-types.ts`. Comments rewritten for the new schema. |
| `src/lib/db/trucks.ts` | Rewritten for the new schema (functions below). |
| `src/lib/db/locations.ts` | Rewritten (functions below). No delete. |
| `supabase/seed.sql` | The three fixed-UUID trucks without `last_known_*`, plus history relative to `now()` (decision #15). |
| `tests/integration/helpers.ts`, `tests/integration/helpers.test.ts` | `posts` and `geocoding_cache` leave the cleanup and the comments; new helpers (below). |
| `tests/integration/db-locations.test.ts` | Rewritten for the new primitives. |
| `tests/integration/setup.ts` | Comments only: they name `NOMINATIM_BASE_URL` (line 73) and `geocoding.ts` (line 87), both removed in Phase 4. |
| `src/lib/fake-data.ts`, `src/hooks/useMapLibre.tsx`, `src/components/Map/TruckPopup.tsx` | **Type imports and type names only**, from `map-types.ts`. No behaviour change. |
| `README.md` | "What works today": the schema is the new design's. |
| `CLAUDE.md` | Step 0: point at this plan. Step 2: the "Target-design rules, enforced from Phase 5" paragraph becomes current rules, and its list of what today's schema breaks goes. |
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
| `listActiveTrucks()` → `Truck[]` | Active trucks, ordered by name. Read by Phase 6's `/api/live` and Phase 7's checklist. |
| ~~`updateLastKnownPosition`~~ | Removed with its columns. |

**`src/lib/db/locations.ts`** (db layer). Postgres errors propagate unchanged (decision #10).
| Function | Does |
|---|---|
| `insertLocation(NewLocation)` → `Location` | Insert and return the stored row. Can raise `23P01` or the CHECK violation. |
| `updateLocation(id, LocationPatch)` → `Location \| null` | Edits place, label or times of a row that isn't cancelled; `null` when no such row. Can raise `23P01` or the CHECK violation. |
| `cancelLocation(id, cancelledAt)` → `Location \| null` | Sets `cancelled_at` where it is still null; `null` when the row is missing or already cancelled. The caller passes the timestamp (decision #10). |
| `findLocationsOverlapping(from, to)` → `Location[]` | Non-cancelled rows with `starts_at < to AND ends_at > from`, all trucks (decision #9). |
| `listRecentLocationsForTruck(truckId, limit)` → `Location[]` | The truck's latest non-cancelled rows, newest `starts_at` first. Phase 7's service dedupes them into "recent places". |
| ~~`findOverlapping`, `deleteLocations`~~ | Removed: the constraint replaces the first; rows are never deleted. |

Every select names its columns through one `LOCATION_COLUMNS` constant, which leaves
out `created_by` (decision #8). It is **one string literal** (`"id, truck_id, …"`), not
built with `join` or typed `string`: supabase-js infers a select's row type from the
literal text, so a computed string loses that inference and with it `tsc`'s check that
the columns exist (issue #48).

**`src/lib/types.ts`**
- `Truck`: the generated `trucks` row.
- `Location`: the generated `locations` row **minus `created_by`**, with `source` narrowed to `'admin' | 'owner'`. It is the shape `LOCATION_COLUMNS` selects. The db functions still return it through `as Location`, because a CHECK carries no type into the generated types and `source` arrives as `string` (today's `src/lib/db/locations.ts:46` casts for the same reason); that cast covers `source` only, since every other key already matches (decision #8).
- `NewLocation`: `Location` minus `id`, `created_at`, `updated_at`, `cancelled_at` (an insert is never born cancelled), **plus `created_by: string | null`**. Every key, `created_by` and `label` included, is required, so a caller states each value.
- `LocationPatch`: an optional pick of `latitude`, `longitude`, `label`, `starts_at`, `ends_at`.

**`src/lib/map-types.ts`**: types only, frozen copies of today's shapes (decision #1).

**`tests/integration/helpers.ts`**
| Helper | Does |
|---|---|
| `seedTruck(name)` | Kept. |
| `seedLocation(truckId, overrides?)` | Inserts a valid location with defaults, so a test states only what it is about. |
| `anonClient()` | A supabase-js client with the anon key. |
| `signedInClient()` | Creates a prefixed auth user and its `users` row through the admin API, signs in, returns an `authenticated` client and its user id. |
| `resetTables()` | Also removes fixture `users` rows and fixture auth users (by an email prefix), children first: `users` rows before trucks (`users.truck_id` references `trucks`, decision #7) and before their auth users (`users.id` references `auth.users`). ⚠ Today's version returns early when no fixture truck exists (`helpers.ts:91`); the user cleanup must run before that return or without it, or a test that creates a user and no truck leaks the user. |

⚠ `resetTables()` removes only `itest-fixture-` trucks and their children, so the
seed's history survives a test run, as intended. A test that counts rows must scope to
its own fixture truck, or the seed leaks into the count.

---

## Steps

Strict order. Each numbered step is one PR into `dev`.

0. **This plan.** The plan file, and `CLAUDE.md` pointing at it as the current plan.
1. **Decouple the map from the schema types.** Create `src/lib/map-types.ts`; switch
   `fake-data.ts`, `useMapLibre.tsx` and `TruckPopup.tsx` to it. A type-only move. Gates
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
   target-design paragraph, `README.md`'s "What works today", `setup.ts`'s comments.
   *One PR because* it is the smallest unit with green gates (decision #2).
3. **Constraint tests.** `tests/integration/schema.test.ts`: overlap → `23P01`; a
   cancelled row doesn't block; back-to-back windows are allowed; `ends_at = starts_at`
   and `ends_at < starts_at` are rejected with **`23514`**; NOT NULL `ends_at`; a bad
   `source` is rejected; `updated_at` moves on UPDATE and `created_at` doesn't. Each
   test asserts the **SQLSTATE**, not only that an error came back: with the CHECK
   dropped, `ends_at < starts_at` still fails, with `22000` from the constructor of
   `tstzrange(starts_at, ends_at)` in the exclusion constraint (decision #4), so an
   "any error" test stays green. Each with a negative control, recorded in the PR.
4. **RLS and grant tests.** `anonClient()`, `signedInClient()` and auth-user cleanup in
   `resetTables()` (with `helpers.test.ts` cases for the new cleanup);
   `tests/integration/rls.test.ts`. A role without a table grant gets **`42501`**
   (permission denied), not an empty result; a role with a grant but no RLS policy
   gets an empty result. So the tests assert `42501` for the missing grants, and the
   one policy test (own `users` row) asserts rows. Record open decision 4.
5. **Phase 5 retrospective**, by the milestone-retrospective procedure in
   `.claude/process-log.md` ("How to use it").
6. **Follow-up issues** the retrospective opens, if any.
7. **Reconcile `project-context.md`** (the end-of-phase task).

   Steps 5–7 are ordered, blocked and closed as that procedure's part 6 says; this plan
   doesn't restate it. Step 7's content: it covers Part 1's "Database", "Modules kept on
   purpose", "Folder structure", "Tests and gates" and the Roadmap row; Part 2's
   "Explicit GRANTs" bullet, whose "Supabase doesn't auto-expose new tables to the API
   roles" leaves out the default privileges decision #6 records; and it carries
   forward the decisions that outlive their phase: this plan's (#10's db-layer rules
   are the likely one) and **Phase 4's #14 and #15**, which were added after Phase 4's
   reconciliation merged, with the tooling they and #149/#150 brought
   (`scripts/claims.sh`, `process-log.sh add`, the values block, the `Caught by`
   groups).

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
create trigger locations_updated_at before update on locations
  for each row execute procedure extensions.moddatetime (updated_at);
```
No custom function lands in `public`, so no function of ours needs its `search_path`
pinned, and neither extension's functions land there either (the stack keeps
`pgcrypto`, `uuid-ossp` and others in `extensions` already). Both forms were probed
in a rolled-back transaction on the local stack (2026-10-18): neither extension was
installed before, both created in `extensions`, the trigger was accepted, and a GiST
exclusion constraint on `uuid` and `tstzrange` raised its conflict on a second
overlapping insert. **Rejected:** a hand-written plpgsql function; it works, but is more
to own. The trigger fires on every UPDATE, cancellation included; a cancelled row never
reaches the map, so its moved `updated_at` shows nowhere.

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
it out too**, so the type is exactly what `LOCATION_COLUMNS` selects. The db layer still
casts with `as Location`, to narrow `source` (a CHECK column arrives as `string`); with
`created_by` in `Location`, that same cast would also hide a key the select never
returns, typed `string | null` and `undefined` at runtime. Keeping the two in step
means the cast does only the narrowing. `NewLocation` adds `created_by` back for
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
reads the clock: `cancelLocation` takes `cancelledAt`, and the overlap query takes its
window, so time stays in the service (`CLAUDE.md`, "Time"). PostgREST can't send
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
query needs it. `0001`'s `locations_truck_starts` and `locations_expires` go.

### #15 — Seed history is relative to `now()`
`seed.sql` builds four weeks of past rows, in Stockholm local times, with
`generate_series`, on the three fixed-UUID trucks (Vintervilan stays inactive). The
series covers the 28 days **before today's Stockholm date and stops at yesterday**.
"The same weekday last week" then exists after any reset. **Plus one row on an active
truck from `now() - interval '1 hour'` to `now() + interval '12 hours'`**. Because the
history stops at yesterday, that row can't overlap a history row, which would raise
`23P01` and fail `db reset` only at certain times of day. (Today's date is the series' risk: a series that included it would put an 11–14
row on the same truck, which the spanning row overlaps whenever a reset runs between
about 10:00 and 14:00.) The row means the live window
`[now, now + 1 day)` holds a row for 12 hours after a reset at any time of day. A row
at fixed Stockholm hours ("today 11–14") would be over by the afternoon, and the live
window would come back empty. **Rejected:** fixed dates, which
fall out of the look-back window as the weeks pass. Open decision 3 covers DST.

### #16 — `trucks` and `users` columns unchanged, minus `last_known_*`
`trucks`, every column `0001` and `0003` left except `last_known_*`: `id` (uuid,
`gen_random_uuid()`), `name` not null, `instagram_handle` unique and nullable,
`cuisine_type` and `description` nullable text, `is_active` and `created_at` not null
with their defaults (`project-context.md`'s Data model lists the same). `users`:
`id` references `auth.users`, `truck_id` nullable, `is_admin` and `created_at` not null.
Nothing in the target design changes them; owner claim columns are the Owners phase's.

---

## Acceptance Criteria

**Schema (steps 2–4)**
- [ ] `ls supabase/migrations` lists only `0001_baseline.sql`.
- [ ] `npx supabase db reset` exits 0 and applies the migration and the seed.
- [ ] `select table_name from information_schema.tables where table_schema = 'public'`
  returns exactly `trucks`, `locations`, `users`.
- [ ] `locations` has exactly the columns of `project-context.md`'s Data model;
  `starts_at` and `ends_at` are NOT NULL; none of `confidence`, `parser_confidence`,
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
- [ ] `schema.test.ts` covers each case in step 3, asserting each case's SQLSTATE
  (`23P01`, `23514`, `23502`), and the PR records a negative control per case
  (constraint dropped or altered locally, test red, restored).
- [ ] `rls.test.ts` shows: anon and `authenticated` get **`42501`** on SELECT, INSERT,
  UPDATE and DELETE against `trucks` and `locations`, each UPDATE and DELETE with a
  filter (`.eq("id", …)`). Without one, the local API answers `21000` ("DELETE requires
  a WHERE clause") before any permission check (probed with the anon key on
  2026-10-18: unfiltered → `21000`, filtered → `42501`); `authenticated` reads its own
  `users` row and not another's (rows, filtered by the policy); its UPDATE of
  `is_admin` or `truck_id` gets `42501` and the row is unchanged afterwards (read with
  `service_role`); `service_role` reads and writes all three. Negative control: a
  temporary `grant select on locations to anon` turns the anon SELECT test red (the
  result becomes an empty list instead of `42501`).

**Types and db layer (step 2)**
- [ ] Re-running `npx supabase gen types typescript --local > src/lib/database.types.ts`
  leaves `git diff --exit-code src/lib/database.types.ts` clean.
- [ ] `grep -rnE "last_known|confidence|expires_at|is_negation|post_id|posts|geocod" src/lib/db src/lib/types.ts src/lib/database.types.ts tests/integration supabase/migrations supabase/seed.sql`
  → no hits. (Not all of `supabase/`: the gitignored CLI cache
  `supabase/.temp/pgdelta/*.json` holds `expires_at` 72 times per file, checked
  2026-10-18.) Old-design names remain only in `map-types.ts`, `fake-data.ts`,
  `useMapLibre.tsx` and `TruckPopup.tsx`.
- [ ] `grep -nE '\.select\(\)|select\("\*"\)|\.delete\(' src/lib/db` → no hits.
- [ ] `LOCATION_COLUMNS` does not contain `created_by`.
- [ ] Each function exported by `db/trucks.ts` and `db/locations.ts` has an integration
  test, including: `insertLocation` and `updateLocation` let a `23P01` through with its
  code; `cancelLocation` returns `null` for an already-cancelled row.
- [ ] Within 12 hours of `npx supabase db reset`, at any time of day,
  `findLocationsOverlapping(now, now + 1 day)` returns at least one seed row, and the
  Stockholm day one week earlier returns at least one (decision #15).
- [ ] Every seed row in the four weeks of history starts and ends at the same
  Stockholm wall-clock times, checked on a series that crosses a DST change (open
  decision 3).

**Map (step 1)**
- [ ] The diffs of `fake-data.ts`, `useMapLibre.tsx` and `TruckPopup.tsx` change only
  type imports and type names.
- [ ] `/map` checked in a real browser (basemap, markers, a popup), noted in the PR.

**Gates (every step)**
- [ ] `npx tsc --noEmit`, `npm run lint`, `npm run test:all`, `npm run build` exit 0,
  read unpiped.
- [ ] Each PR records both vitest projects' file and test counts. Integration: 2 files
  today, 5 at the end (open decision 7).

**Docs (step 2, under the sweep)**
- [ ] `CLAUDE.md` no longer has the "Target-design rules, enforced from Phase 5"
  paragraph listing what today's schema breaks; the Locations and anon-SELECT rules
  read as current.
- [ ] `README.md`'s "What works today" describes the new schema.

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
3. **Seed times across DST.** Rows at 11:00–14:00 Stockholm time over four weeks must
   stay at 11:00–14:00 across a DST change. The seed's real window holds a DST change
   only in the four weeks after one (the next is 2026-10-25, a week after this plan
   was written), so a check run on today's seed can pass with no change inside it.
   Build the times with `at time zone 'Europe/Stockholm'`, and check the expression on
   a fixed anchor that puts a change inside the series (e.g. `now()` replaced by
   `timestamptz '2026-11-05 12:00+01'`): every row's Stockholm start must be 11:00.
4. **Auth fixtures for `rls.test.ts`.** Does local Auth accept
   `admin.createUser({ email_confirm: true })` and a password sign-in, or does the test
   need OTP? Delete order: the `users` row, then the auth user (`users.id` references
   `auth.users` with no cascade). The email prefix must hold no `%`, `_` or `*`, for the
   reason `FIXTURE_PREFIX` records in `helpers.ts`.
5. **How `23P01` arrives through supabase-js.** Confirm a PostgREST error on insert and
   update carries `code: "23P01"`; Phase 7's 409 mapping depends on it. Step 2's tests
   pin it.
6. **`is_active` in the live read.** `findLocationsOverlapping` doesn't filter by the
   truck's state. Whether Phase 6 filters in its service or adds a joined query is
   Phase 6's call; this phase only records that the primitive doesn't.
7. **Integration file count.** The AC expects 5 files at the end. If step 3 or 4
   splits or merges a file, that PR records the new count and why.

Product decisions #1 (retention), #3 (default times) and #4 (app name) stay open for
Phases 7–8. This plan's schema doesn't wait on them: retention would filter or delete
rows, and the other two are UI text and form defaults.
