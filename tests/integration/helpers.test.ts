import { afterEach, describe, expect, it } from "vitest";
import { supabaseAdmin } from "@/lib/supabase";
import { FIXTURE_PREFIX, resetTables, seedLocation, seedTruck, seedTrucks } from "./helpers";

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
  // The assertion is that the bystanders SURVIVE, not only that the fixture is gone: an
  // over-wide delete fails no test of its own. Two earlier predicates (every row, then a
  // prefix with LIKE wildcards) deleted trucks this suite never made, with every test
  // green (PR #106).
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

it("removes more fixture trucks than the API's max_rows", async () => {
  // In one pass, the ids of 1001 trucks overflow the `.in()` filter's URL ("URI too
  // long") and the select stops at max_rows; `resetTables` loops in batches.
  await seedTrucks("Bulk", 1001);

  await resetTables();

  const { count, error } = await supabaseAdmin
    .from("trucks")
    .select("id", { count: "exact", head: true })
    .like("name", `${FIXTURE_PREFIX}%`);
  if (error) throw error;
  expect(count).toBe(0);
}, 30_000);

it("removes a fixture's children before the fixture itself", async () => {
  // `locations.truck_id` references `trucks` with no cascade, so a cleanup that deletes
  // trucks first fails on the foreign key (`23503`). This passes only if the order is
  // right. `seedLocation` throws on a failed insert, so the child row exists.
  const fixture = await seedTruck();
  await seedLocation(fixture);

  await expect(resetTables()).resolves.toBeUndefined();

  const orphans = await supabaseAdmin.from("locations").select("id").eq("truck_id", fixture);
  expect(orphans.data).toEqual([]);
}, 20_000);

describe("seedLocation", () => {
  async function windowsOf(truckId: string) {
    const { data, error } = await supabaseAdmin
      .from("locations")
      .select("starts_at, ends_at")
      .eq("truck_id", truckId)
      .order("starts_at");
    if (error) throw error;
    return data;
  }

  it("gives two default calls on one truck windows that don't overlap", async () => {
    // Both inserts succeeding is the claim: on one window the second raises 23P01.
    const truckId = await seedTruck();
    await seedLocation(truckId);
    await seedLocation(truckId);

    const [first, second] = await windowsOf(truckId);
    expect(Date.parse(second.starts_at)).toBeGreaterThanOrEqual(Date.parse(first.ends_at));
  });

  it("keeps a window the test passes", async () => {
    const truckId = await seedTruck();
    await seedLocation(truckId, {
      starts_at: "2026-08-22T09:00:00.000Z",
      ends_at: "2026-08-22T12:00:00.000Z",
    });

    const [row] = await windowsOf(truckId);
    expect(Date.parse(row.starts_at)).toBe(Date.parse("2026-08-22T09:00:00.000Z"));
    expect(Date.parse(row.ends_at)).toBe(Date.parse("2026-08-22T12:00:00.000Z"));
  });

  it.each([
    ["starts_at", { starts_at: "2026-08-22T09:00:00.000Z" }],
    ["ends_at", { ends_at: "2026-08-22T12:00:00.000Z" }],
  ])("throws when only %s is given, and inserts nothing", async (_bound, overrides) => {
    const truckId = await seedTruck();

    await expect(seedLocation(truckId, overrides)).rejects.toThrow(/both starts_at and ends_at/);
    expect(await windowsOf(truckId)).toEqual([]);
  });

  it("puts the row on the truck it is given, whatever the overrides say", async () => {
    // A row on another truck (a seed truck, say) would leak past `resetTables()`.
    const truckId = await seedTruck();
    const otherTruck = await seedTruck("Other");

    // @ts-expect-error `truck_id` isn't an override; `tsc` fails here if it becomes one.
    const row = await seedLocation(truckId, { truck_id: otherTruck });

    expect(row.truck_id).toBe(truckId);
  });
});
