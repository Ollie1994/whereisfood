import { afterEach, expect, it } from "vitest";
import { supabaseAdmin } from "@/lib/supabase";
import { resetTables, seedTruck } from "./helpers";

// ⚠ EVERY BYSTANDER IS ADVERSARIAL, AND THE FIRST VERSION'S WAS NOT. It was named
// "Seed-like Truck", which stands in for `seed.sql`'s dev trucks — and that is exactly
// why it could not catch the r2 defect: the prefix was `__itest__`, `_` is a
// single-character LIKE wildcard, and `__itest__%` matched arbitrary names containing
// "itest". A bystander with no "itest" in it was never going to notice.
//
// So these names are chosen to be matched by the ways this predicate can plausibly be
// wrong, not by the way it is meant to work:
//
//   the seed stand-in           the ordinary case the r1 finding was about
//   a LIKE-wildcard near-miss   matched by `__itest__%`, not by a real prefix
//   an unanchored near-miss     contains the marker but does not START with it,
//                               so it is matched by `%itest-fixture-%`
const BYSTANDERS = [
  { id: "99999999-9999-9999-9999-999999999991", name: "Seed-like Truck" },
  { id: "99999999-9999-9999-9999-999999999992", name: "XXitestYYnot-a-fixture" },
  { id: "99999999-9999-9999-9999-999999999993", name: "Definitely itest-fixture-adjacent" },
];

// Fixed ids so a crashed run leaves something identifiable rather than random orphans,
// and `afterEach` rather than `afterAll` so a failure part-way through still cleans up.
afterEach(async () => {
  // ⚠ THE ERROR IS CHECKED, AND IT HAS TO BE. These trucks deliberately carry NO fixture
  // prefix — that is what makes them bystanders — so `resetTables()` can never collect
  // them. supabase-js returns `{ error }` rather than throwing, so an ignored failure
  // here leaves rows in the dev database permanently, which is the very thing this file
  // exists to prevent (PR #106 r3).
  const { error } = await supabaseAdmin
    .from("trucks")
    .delete()
    .in("id", BYSTANDERS.map((truck) => truck.id));

  if (error) throw error;
});

it("⚠ resetTables deletes only what this suite created", async () => {
  // THE REGRESSION THIS FILE EXISTS FOR, now hit twice. A first version deleted ALL of
  // `locations`, `posts` and `trucks`, destroying `seed.sql`'s three fixed-UUID dev
  // trucks — including the deliberately INACTIVE one Phase 2's rejection tests need.
  // `npm run test:all` is the documented merge gate, so running the gate broke every
  // documented curl flow (r1). The fix for that then used a prefix containing LIKE
  // wildcards, which matched unrelated trucks (r2).
  //
  // Both times nothing went red. A destructive side effect produces no failure, which
  // is why the assertion has to be that the bystanders SURVIVE rather than that the
  // fixtures are gone.
  await supabaseAdmin
    .from("trucks")
    .upsert(BYSTANDERS.map((truck) => ({ ...truck, is_active: true })));

  const fixture = await seedTruck();
  await resetTables();

  const survivors = await supabaseAdmin
    .from("trucks")
    .select("id")
    .in("id", BYSTANDERS.map((truck) => truck.id));
  const removed = await supabaseAdmin.from("trucks").select("id").eq("id", fixture).maybeSingle();

  expect(survivors.data?.map((row) => row.id).sort()).toEqual(
    BYSTANDERS.map((truck) => truck.id).sort(),
  );
  // And it did do its job — the fixture is gone.
  expect(removed.data).toBeNull();
}, 20_000);

it("removes a fixture's children before the fixture itself", async () => {
  // `locations` and `posts` reference `trucks`, so a cleanup that deletes trucks first
  // fails on a foreign key rather than leaving orphans. This passes only if the order
  // is right, and it is the reason `resetTables` iterates a list rather than running
  // three statements whose order reads as incidental.
  const fixture = await seedTruck();

  // ⚠ CHECKED. supabase-js returns `{ error }` rather than throwing, so an unchecked
  // insert makes this test VACUOUS the moment a migration adds a NOT NULL column: the
  // insert 400s, there is no child row for `resetTables()` to order around, and the
  // test passes green while asserting nothing (PR #106 r3).
  const { error: insertError } = await supabaseAdmin.from("locations").insert({
    truck_id: fixture,
    latitude: 57.6998935,
    longitude: 11.952503,
    starts_at: "2026-08-22T09:00:00.000Z",
    expires_at: "2026-08-22T12:00:00.000Z",
    source: "webhook",
    confidence: 0.85,
    parser_confidence: 1.0,
    source_confidence: 0.85,
    is_negation: false,
  });
  if (insertError) throw insertError;

  await expect(resetTables()).resolves.toBeUndefined();

  const orphans = await supabaseAdmin.from("locations").select("id").eq("truck_id", fixture);
  expect(orphans.data).toEqual([]);
}, 20_000);
