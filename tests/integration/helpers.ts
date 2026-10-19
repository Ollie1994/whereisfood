import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";
import type { Location, NewLocation } from "@/lib/types";

// Minimal fixtures for the integration project. Deliberately small — #72 EXTENDS this
// file rather than replacing it, so what lands here is only what #64 needs.
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
const FIXTURE_PREFIX = "itest-fixture-";

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
export async function resetTables(): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("trucks")
    .select("id")
    .like("name", `${FIXTURE_PREFIX}%`);

  if (error) throw error;

  const fixtureTruckIds = (data ?? []).map((row) => row.id);
  // Nothing this suite made, so nothing to remove. Also what keeps the `.in()` calls
  // below off an empty array.
  if (fixtureTruckIds.length === 0) return;

  const { error: locationError } = await supabaseAdmin
    .from("locations")
    .delete()
    .in("truck_id", fixtureTruckIds);

  if (locationError) throw locationError;

  const { error: truckError } = await supabaseAdmin
    .from("trucks")
    .delete()
    .in("id", fixtureTruckIds);

  if (truckError) throw truckError;
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
export async function seedTruck(name = "Truck"): Promise<string> {
  const id = randomUUID();

  const { error } = await supabaseAdmin
    .from("trucks")
    .insert({ id, name: `${FIXTURE_PREFIX}${name}`, is_active: true });

  if (error) throw error;
  return id;
}

// Day *n* of the default windows: each call without its own window gets a day no
// earlier call used, so two default locations on one truck never overlap (`23P01`).
let defaultWindowDay = 0;

// Insert a valid location on `truckId` and return the stored row (every column,
// `created_by` included), so a test states only the columns it is about. Inserts with `supabaseAdmin`, not `insertLocation`, so the db
// layer's tests don't depend on the code under test for their setup.
//
// Without `starts_at`/`ends_at`, the window is 09:00–12:00 UTC on day *n* after
// 2000-01-01. A test that passes its own window keeps it after 2020, clear of these
// (the counter reaches 2020 after about 7,300 default calls in one run).
//
// ⚠ THROWS IF EXACTLY ONE OF `starts_at`/`ends_at` IS GIVEN: the default for the other
// would come from the year-2000 window, giving `23514` or a window decades long.
// `cancelled_at` too, which `NewLocation` leaves out, so a test can seed a cancelled row
// in one insert.
type SeedLocationOverrides = Partial<NewLocation> & Partial<Pick<Location, "cancelled_at">>;

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
    const day = Date.UTC(2000, 0, 1) + defaultWindowDay * 86_400_000;
    defaultWindowDay += 1;
    window = {
      starts_at: new Date(day + 9 * 3_600_000).toISOString(),
      ends_at: new Date(day + 12 * 3_600_000).toISOString(),
    };
  }

  const location: NewLocation & SeedLocationOverrides = {
    truck_id: truckId,
    latitude: 57.6998935,
    longitude: 11.952503,
    label: "Järntorget",
    source: "admin",
    created_by: null,
    ...overrides,
    ...window,
  };

  const { data, error } = await supabaseAdmin
    .from("locations")
    .insert(location)
    .select()
    .single();

  if (error) throw error;
  return data;
}
