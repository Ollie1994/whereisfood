import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";
import type { Location, NewLocation } from "@/lib/types";

// Fixtures and checks more than one integration test file needs: fixture trucks and
// locations, their cleanup, bulk inserts and the key-set helper. The Phase 5 plan's
// "`tests/integration/helpers.ts`" table lists them, with the ones step 4 adds.
//
// Safe to import `supabaseAdmin` at module scope because `setup.ts` runs first and has
// already populated `process.env` and refused any non-local database.

// ⚠ EVERY FIXTURE TRUCK IS NAME-PREFIXED, AND THAT PREFIX IS THE ONLY THING THAT MAKES
// CLEANUP SAFE. An unscoped `resetTables()` deletes `supabase/seed.sql`'s fixed-UUID
// trucks and their history, so running `npm run test:all` would break the seed until
// the next `npx supabase db reset` (observed before the prefix: after one run the
// database held none of the three seed trucks, PR #106).
//
// ⚠ A DELETE CANNOT BE SCOPED BY INTENT, ONLY BY A PREDICATE. "Clean up after the
// tests" is not something a query can express; "delete the rows whose name starts with
// this marker" is. The prefix is what turns the first into the second, and it also
// makes cleanup idempotent across runs — a crashed run's rows are still identifiable
// next time.
//
// ⚠ NO LIKE METACHARACTERS IN THE PREFIX, AND THE FIRST VERSION HAD FOUR. It was
// `__itest__`, and `_` is a SINGLE-CHARACTER WILDCARD in SQL LIKE — so `__itest__%` is
// not a prefix match at all. Verified against the local database: it matched
// `XXitestYYnot-a-fixture` and `A_itest_B real truck`, arbitrary trucks nobody's test
// created, and would have deleted them with their locations.
//
// That is the r1 finding a second time: a fix for a destructive scoping bug introduced
// a different destructive scoping bug, and again nothing went red. The guard test could
// not catch it either, because I had given its bystander a friendly name that happens
// not to contain "itest" — a guard written for the failure I had in mind rather than
// the one the predicate allows.
//
// Escaping (`\_\_itest\_\_%`) also works and was verified, but a prefix containing no
// metacharacters is the version with nothing left to get wrong: there is no escaping to
// remember when someone changes this string. The module-load check below makes that a
// checked property rather than a convention.
export const FIXTURE_PREFIX = "itest-fixture-";

// ⚠ THREE, NOT TWO, AND THE THIRD IS NOT A LIKE WILDCARD AT ALL. SQL LIKE has `%` and
// `_`. But this prefix does not reach SQL directly — supabase-js appends it verbatim to
// a PostgREST query string, and **PostgREST translates `*` into `%`** before Postgres
// ever sees it. Verified: `.like("name", "*anything*")` matched `ZZZanythingZZZ`.
//
// So the guard is about the WHOLE PATH the string travels, not about the language at
// the end of it. A first version checked SQL's two wildcards, which is the right answer
// to the wrong question — and `*` would have passed it and silently widened a
// destructive delete, which is the r2 defect one metacharacter over (PR #106 r3).
const WILDCARDS_ON_THE_PATH_TO_POSTGRES = /[%_*]/;

if (WILDCARDS_ON_THE_PATH_TO_POSTGRES.test(FIXTURE_PREFIX)) {
  // Throwing at module load rather than asserting in a test: this file's consumers
  // DELETE ROWS, and a suite that has already started is too late to find out its
  // cleanup predicate is wider than intended.
  throw new Error(
    `FIXTURE_PREFIX must contain none of % _ * — got "${FIXTURE_PREFIX}". ` +
      "% and _ are SQL LIKE wildcards; * is one too, because PostgREST rewrites it to %. " +
      "Any of them makes the prefix match rows this suite never created, and " +
      "resetTables() deletes what it matches.",
  );
}

// Remove every row THIS SUITE created, and nothing else.
//
// ⚠ CHILDREN FIRST: `locations` references `trucks` with no cascade (Phase 5 plan,
// #7), so deleting a fixture truck that still has locations fails with `23503`.
//
// Deleting `locations` rows here is cleanup of fixture rows only; the app never deletes
// one (`CLAUDE.md`, "Locations").
//
// ⚠ IN BATCHES, UNTIL NO FIXTURE TRUCK IS LEFT. The select returns at most the API's
// `max_rows`, and every id goes into the `.in()` filter's URL: with 1001 fixture trucks
// left by an interrupted run of the `listActiveTrucks` max_rows test, one pass failed
// with "URI too long" (2026-10-19). A pass that removes fewer trucks than it found
// throws, so the loop can't spin on the same ids.
const RESET_BATCH = 100;

export async function resetTables(): Promise<void> {
  for (;;) {
    const { data, error } = await supabaseAdmin
      .from("trucks")
      .select("id")
      .like("name", `${FIXTURE_PREFIX}%`)
      .limit(RESET_BATCH);

    if (error) throw error;

    const fixtureTruckIds = data.map((row) => row.id);
    // Nothing this suite made is left, so nothing to remove. Also what keeps the
    // `.in()` calls below off an empty array.
    if (fixtureTruckIds.length === 0) return;

    const { error: locationError } = await supabaseAdmin
      .from("locations")
      .delete()
      .in("truck_id", fixtureTruckIds);

    if (locationError) throw locationError;

    const { data: removed, error: truckError } = await supabaseAdmin
      .from("trucks")
      .delete()
      .in("id", fixtureTruckIds)
      .select("id");

    if (truckError) throw truckError;
    if (removed.length !== fixtureTruckIds.length) {
      throw new Error(
        `resetTables: removed ${removed.length} of ${fixtureTruckIds.length} fixture trucks; stopping rather than looping`,
      );
    }
  }
}

// A truck to hang locations off. Returns the id rather than the row: every caller so far
// wants the foreign key, and returning the row would invite assertions on fixture data.
//
// The id is generated here rather than left to the column default so the caller has it
// before the insert resolves, and so a test can create two trucks without a round trip
// to tell them apart.
//
// ⚠ TESTS MUST USE THIS RATHER THAN INSERTING A TRUCK DIRECTLY. `resetTables()` can only
// remove what carries the prefix, so a hand-rolled truck leaks — and a location hung off
// a SEED truck leaks too, because its parent is never collected. That is the trade for
// not deleting rows this suite did not create.
export async function seedTruck(name = "Truck", isActive = true): Promise<string> {
  const id = randomUUID();

  const { error } = await supabaseAdmin
    .from("trucks")
    .insert({ id, name: `${FIXTURE_PREFIX}${name}`, is_active: isActive });

  if (error) throw error;
  return id;
}

// A row's keys, sorted, for the db tests' key-set checks: each compares them with a
// list written out in the test, the only guard against an extra selected column.
export function keysOf(row: object): string[] {
  return Object.keys(row).sort();
}

// The place every fixture location stands at unless a test says otherwise.
export const FIXTURE_PLACE = { latitude: 57.6998935, longitude: 11.952503, label: "Järntorget" };

// The fixture window on the UTC day starting at `dayMs`: 09:00–12:00 UTC.
export function dayWindow(dayMs: number): Pick<NewLocation, "starts_at" | "ends_at"> {
  return {
    starts_at: new Date(dayMs + 9 * 3_600_000).toISOString(),
    ends_at: new Date(dayMs + 12 * 3_600_000).toISOString(),
  };
}

// Day *n* of the default windows: each call without its own window gets a day no
// earlier call used, so two default locations on one truck never overlap (`23P01`).
let defaultWindowDay = 0;

// Insert a valid location on `truckId` and return the stored row (`created_by`
// included), so a test states only the columns it is about. Inserts with
// `supabaseAdmin`, not `insertLocation`, so the db layer's tests don't depend on the
// code under test for their setup.
//
// Without `starts_at`/`ends_at`, the window is 09:00–12:00 UTC on day *n* after
// 2000-01-01. A test that passes its own window keeps it after 2020, clear of these
// (the counter reaches 2020 after about 7,300 default calls in one run).
//
// ⚠ THROWS IF EXACTLY ONE OF `starts_at`/`ends_at` IS GIVEN: the default for the other
// would come from the year-2000 window, giving `23514` or a window decades long.
//
// The overrides take `id` and `cancelled_at` too, which `NewLocation` leaves out, so a
// test can fix an id or seed a cancelled row in one insert. Never `truck_id`: a row put
// on a seed truck through it would leak past `resetTables()`, so `truckId` always wins.
type SeedLocationOverrides = Partial<Omit<NewLocation, "truck_id">> &
  Partial<Pick<Location, "id" | "cancelled_at">>;

export async function seedLocation(
  truckId: string,
  overrides: SeedLocationOverrides = {},
): Promise<Tables<"locations">> {
  const { starts_at, ends_at } = overrides;
  if ((starts_at === undefined) !== (ends_at === undefined)) {
    throw new Error("seedLocation: give both starts_at and ends_at, or neither");
  }

  let window: Pick<NewLocation, "starts_at" | "ends_at">;
  if (starts_at !== undefined && ends_at !== undefined) {
    window = { starts_at, ends_at };
  } else {
    window = dayWindow(Date.UTC(2000, 0, 1) + defaultWindowDay * 86_400_000);
    defaultWindowDay += 1;
  }

  const location: NewLocation & SeedLocationOverrides = {
    ...FIXTURE_PLACE,
    source: "admin",
    created_by: null,
    ...overrides,
    ...window,
    truck_id: truckId,
  };

  const { data, error } = await supabaseAdmin
    .from("locations")
    .insert(location)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Insert `count` locations on `truckId` in one request, one a day from `firstDay`
// (a UTC midnight) at 09:00–12:00 UTC, for the tests that need more rows than the API's
// `max_rows`.
export async function seedDailyLocations(
  truckId: string,
  firstDay: string,
  count: number,
): Promise<void> {
  const start = Date.parse(firstDay);
  const rows = Array.from({ length: count }, (_, n) => ({
    truck_id: truckId,
    ...FIXTURE_PLACE,
    ...dayWindow(start + n * 86_400_000),
  }));

  const { error } = await supabaseAdmin.from("locations").insert(rows);
  if (error) throw error;
}

// Insert `count` active fixture trucks in one request, named `${name} 0001` and so on,
// for the tests that need more trucks than the API's `max_rows`. Prefixed like
// `seedTruck`'s, so `resetTables()` removes them.
export async function seedTrucks(name: string, count: number): Promise<void> {
  const rows = Array.from({ length: count }, (_, n) => ({
    id: randomUUID(),
    name: `${FIXTURE_PREFIX}${name} ${String(n + 1).padStart(4, "0")}`,
    is_active: true,
  }));

  const { error } = await supabaseAdmin.from("trucks").insert(rows);
  if (error) throw error;
}

// A location row as stored, every column, to check what a test's call left behind
// without going through the code under test.
export async function readLocation(id: string): Promise<Tables<"locations">> {
  const { data, error } = await supabaseAdmin.from("locations").select().eq("id", id).single();
  if (error) throw error;
  return data;
}
