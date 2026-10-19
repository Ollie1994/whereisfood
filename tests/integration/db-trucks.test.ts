import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { getActiveTruckById, listActiveTrucks } from "@/lib/db/trucks";
import { keysOf, resetTables, seedTruck, seedTrucks } from "./helpers";

// The keys every function's rows must have, WRITTEN OUT rather than derived from a
// type, which would grow with the table. `tsc` catches a column missing from the
// select; only this catches an extra one (or a `*`).
const TRUCK_KEYS = [
  "created_at",
  "cuisine_type",
  "description",
  "id",
  "instagram_handle",
  "is_active",
  "name",
];

beforeEach(async () => {
  await resetTables();
});

describe("getActiveTruckById", () => {
  it("returns an active truck with exactly the selected keys", async () => {
    const id = await seedTruck();

    const truck = await getActiveTruckById(id);

    expect(truck?.id).toBe(id);
    expect(keysOf(truck!)).toEqual(TRUCK_KEYS);
  });

  it("returns null for an inactive truck", async () => {
    expect(await getActiveTruckById(await seedTruck("Inactive", false))).toBeNull();
  });

  it("returns null for an unknown id", async () => {
    expect(await getActiveTruckById(randomUUID())).toBeNull();
  });
});

describe("listActiveTrucks", () => {
  // The seed's trucks are in the list too, so each assertion reads only this test's
  // fixture trucks.
  it("returns active trucks in Swedish name order, without inactive ones, with exactly the selected keys", async () => {
    // Inserted out of order. Swedish order puts Å, Ä, Ö after Z and ignores case; the
    // stack's default collation gave `Åkes < Alpha < Ärtsoppan < burgare < Öl < Zebra`
    // (checked 2026-10-19).
    const oel = await seedTruck("Öl");
    const zebra = await seedTruck("Zebra");
    const aertsoppan = await seedTruck("Ärtsoppan");
    const burgare = await seedTruck("burgare");
    const akes = await seedTruck("Åkes");
    const alpha = await seedTruck("Alpha");
    const inactive = await seedTruck("Inactive", false);
    const fixtures = [oel, zebra, aertsoppan, burgare, akes, alpha, inactive];

    const trucks = await listActiveTrucks();
    const fixtureIds = trucks.map((truck) => truck.id).filter((id) => fixtures.includes(id));

    expect(fixtureIds).toEqual([alpha, burgare, zebra, akes, aertsoppan, oel]);
    expect(trucks.every((truck) => keysOf(truck).join() === TRUCK_KEYS.join())).toBe(true);
  });
});

// Last in the file: 1001 trucks are more rows than any other test here needs.
describe("listActiveTrucks at the API's max_rows", () => {
  it("throws rather than return part of the trucks", async () => {
    // One more than `max_rows` in `supabase/config.toml`; the seed's active trucks add to
    // the count, so only the 1000 that arrive is asserted.
    await seedTrucks("Bulk", 1001);

    await expect(listActiveTrucks()).rejects.toThrow(/1000 of \d+ rows/);
  }, 30_000);
});
