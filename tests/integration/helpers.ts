import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";

// Minimal fixtures for the integration project. Deliberately small — #72 EXTENDS this
// file rather than replacing it, so what lands here is only what #64 needs.
//
// Safe to import `supabaseAdmin` at module scope because `setup.ts` runs first and has
// already populated `process.env` and refused any non-local database.

// ⚠ EVERY FIXTURE TRUCK IS NAME-PREFIXED, AND THAT PREFIX IS THE ONLY THING THAT MAKES
// CLEANUP SAFE. A first version of `resetTables()` deleted ALL of `locations`, `posts`
// and `trucks` — which destroyed `supabase/seed.sql`'s three fixed-UUID dev trucks
// (Burgarbilen, Taco Loco Göteborg, and the deliberately INACTIVE Vintervilan that
// Phase 2's rejection tests need) along with any local `posts` corpus.
//
// That is not a tidiness problem. `npm run test:all` is the documented merge gate, so
// running the gate broke every documented Phase 2 curl flow until someone thought to
// run `npx supabase db reset` — and the seed comment explains those UUIDs are fixed
// precisely so curl commands stay copy-pasteable. Confirmed empirically before the fix:
// after one run the database held one leftover fixture truck and none of the three seed
// trucks.
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
// created, and would have deleted them with their posts and locations.
//
// That is the r1 finding a second time: a fix for a destructive scoping bug introduced
// a different destructive scoping bug, and again nothing went red. The guard test could
// not catch it either, because I had given its bystander a friendly name that happens
// not to contain "itest" — a guard written for the failure I had in mind rather than
// the one the predicate allows.
//
// Escaping (`\_\_itest\_\_%`) also works and was verified, but a prefix containing no
// metacharacters is the version with nothing left to get wrong: there is no escaping to
// remember when someone changes this string. `assertNoLikeMetacharacters` below makes
// that a checked property rather than a convention.
const FIXTURE_PREFIX = "itest-fixture-";

// LIKE's only two wildcards. A prefix containing either stops being a prefix.
const LIKE_METACHARACTERS = /[%_]/;

if (LIKE_METACHARACTERS.test(FIXTURE_PREFIX)) {
  // Throwing at module load rather than asserting in a test: this file's consumers
  // DELETE ROWS, and a suite that has already started is too late to find out its
  // cleanup predicate is wider than intended.
  throw new Error(
    `FIXTURE_PREFIX must contain no SQL LIKE metacharacters (% or _); got "${FIXTURE_PREFIX}". ` +
      "Those are wildcards, so the prefix would match rows this suite never created — " +
      "and resetTables() deletes what it matches.",
  );
}

// Remove every row THIS SUITE created, and nothing else.
//
// ⚠ CHILDREN FIRST: `locations` and `posts` both reference `trucks`, so the trucks must
// go last or the delete violates a foreign key. Written as a list so the dependency is
// visible rather than implied by consecutive statements.
//
// ⚠ NOT `geocoding_cache`. It is keyed on an address rather than a truck, nothing in
// these tests asserts its contents, and it is expensive to refill — a cleared cache
// means every later run re-queries Nominatim, a live third party under a usage policy.
// A test that needs a specific key absent should clear that key.
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

  for (const table of ["locations", "posts"] as const) {
    const { error: childError } = await supabaseAdmin
      .from(table)
      .delete()
      .in("truck_id", fixtureTruckIds);

    if (childError) throw childError;
  }

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
