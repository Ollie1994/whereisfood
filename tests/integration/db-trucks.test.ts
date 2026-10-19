import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { getActiveTruckById, listActiveTrucks } from "@/lib/db/trucks";
import { supabaseAdmin } from "@/lib/supabase";
import { keysOf, resetTables, seedTruck } from "./helpers";

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

async function seedInactiveTruck(name: string): Promise<string> {
  const id = await seedTruck(name);
  const { error } = await supabaseAdmin.from("trucks").update({ is_active: false }).eq("id", id);
  if (error) throw error;
  return id;
}

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
    expect(await getActiveTruckById(await seedInactiveTruck("Inactive"))).toBeNull();
  });

  it("returns null for an unknown id", async () => {
    expect(await getActiveTruckById(randomUUID())).toBeNull();
  });
});

describe("listActiveTrucks", () => {
  // The seed's trucks are in the list too, so each assertion reads only this test's
  // fixture trucks.
  it("returns active trucks ordered by name, without inactive ones, with exactly the selected keys", async () => {
    const zebra = await seedTruck("Zebra");
    const alpha = await seedTruck("Alpha");
    const inactive = await seedInactiveTruck("Inactive");

    const trucks = await listActiveTrucks();
    const fixtureIds = trucks
      .map((truck) => truck.id)
      .filter((id) => [zebra, alpha, inactive].includes(id));

    expect(fixtureIds).toEqual([alpha, zebra]);
    expect(trucks.every((truck) => keysOf(truck).join() === TRUCK_KEYS.join())).toBe(true);
  });
});
