import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getActiveTruckById, insertTruck, listActiveTrucks, listAllTrucks, updateTruck } from "@/lib/db/trucks";
import { supabaseAdmin } from "@/lib/supabase";
import { FIXTURE_PREFIX, keysOf, removeTrucks, resetTables, seedLocation, seedTruck, seedTrucks } from "./helpers";

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

describe("listActiveTrucks at the API's max_rows", () => {
  it("throws rather than return part of the trucks", async () => {
    // One more than `max_rows` in `supabase/config.toml`; the seed's active trucks add to
    // the count, so only the 1000 that arrive is asserted.
    await seedTrucks("Bulk", 1001);

    await expect(listActiveTrucks()).rejects.toThrow(/1000 of \d+ rows/);
    // Removed here, inside this test's timeout, rather than by the next hook.
    await resetTables();
  }, 30_000);
});

describe("listAllTrucks", () => {
  it("returns every truck in Swedish name order, inactive ones included, with exactly the selected keys", async () => {
    const oel = await seedTruck("Öl", false);
    const zebra = await seedTruck("Zebra");
    const akes = await seedTruck("Åkes");
    const alpha = await seedTruck("Alpha", false);
    const fixtures = [oel, zebra, akes, alpha];

    const trucks = await listAllTrucks();
    const fixtureIds = trucks.map((truck) => truck.id).filter((id) => fixtures.includes(id));

    expect(fixtureIds).toEqual([alpha, zebra, akes, oel]);
    expect(trucks.every((truck) => keysOf(truck).join() === TRUCK_KEYS.join())).toBe(true);
  });
});

describe("listAllTrucks at the API's max_rows", () => {
  it("throws rather than return part of the trucks", async () => {
    // One more than `max_rows` in `supabase/config.toml`; the seed's trucks add to the
    // count, so only the 1000 that arrive is asserted.
    await seedTrucks("Bulk", 1001);

    await expect(listAllTrucks()).rejects.toThrow(/1000 of \d+ rows/);
    await resetTables();
  }, 30_000);
});

describe.each([
  ["listActiveTrucks", listActiveTrucks],
  ["listAllTrucks", listAllTrucks],
])("%s", (_, list) => {
  // Five trucks of one name, so the insert order matching the id order by chance is 1 in 120.
  it("breaks a name tie by id", async () => {
    const ids: string[] = [];
    for (let n = 0; n < 5; n++) ids.push(await seedTruck("Samma namn"));

    const listed = (await list()).map((truck) => truck.id).filter((id) => ids.includes(id));

    expect(listed).toEqual([...ids].sort());
  });
});

// A truck these tests write through the code under test: removed after each test
// (`removeTrucks`, below), and named with the fixture prefix so a failed run's is caught
// by `resetTables`.
const NEW_TRUCK = {
  name: `${FIXTURE_PREFIX}Ny bil`,
  instagram_handle: "itest_fixture_ny",
  cuisine_type: "Tacos",
  description: "En ny bil",
  is_active: true,
};

// Trucks these tests made through `insertTruck`, removed after each test by `removeTrucks`.
const made: string[] = [];
afterEach(async () => {
  await removeTrucks(made.splice(0));
});

async function insert(truck: Parameters<typeof insertTruck>[0]) {
  const stored = await insertTruck(truck);
  made.push(stored.id);
  return stored;
}

async function readTruck(id: string) {
  const { data, error } = await supabaseAdmin.from("trucks").select().eq("id", id).single();
  if (error) throw error;
  return data;
}

describe("insertTruck", () => {
  it("stores the truck and returns it with exactly the selected keys", async () => {
    const truck = await insert(NEW_TRUCK);

    expect(truck).toMatchObject(NEW_TRUCK);
    expect(keysOf(truck)).toEqual(TRUCK_KEYS);
    expect(await readTruck(truck.id)).toMatchObject(NEW_TRUCK);
  });

  // `{ ...row, name }` would otherwise send the row's `id` and `created_at` too.
  it("writes only the truck's own columns", async () => {
    const extra = { ...NEW_TRUCK, id: randomUUID(), created_at: "2000-01-01T00:00:00Z" } as typeof NEW_TRUCK;

    const truck = await insert(extra);

    expect(truck.id).not.toBe((extra as unknown as { id: string }).id);
    expect(Date.parse(truck.created_at)).toBeGreaterThan(Date.parse("2020-01-01T00:00:00Z"));
  });

  // The service maps this to 409 by the constraint's name.
  it("raises 23505 naming trucks_instagram_handle_key for a handle another truck has", async () => {
    await insert(NEW_TRUCK);

    await expect(insert({ ...NEW_TRUCK, name: `${FIXTURE_PREFIX}Annan` })).rejects.toMatchObject({
      code: "23505",
      message: expect.stringContaining("trucks_instagram_handle_key"),
    });
  });

  it("stores two trucks with no handle", async () => {
    await insert({ ...NEW_TRUCK, instagram_handle: null });
    await expect(insert({ ...NEW_TRUCK, instagram_handle: null })).resolves.toMatchObject({ instagram_handle: null });
  });
});

describe("updateTruck", () => {
  it("changes only the patch's columns and returns the truck with exactly the selected keys", async () => {
    const id = await seedTruck("Före");
    const before = await readTruck(id);

    const truck = await updateTruck(id, { is_active: false });

    expect(truck).toMatchObject({ id, is_active: false, name: before.name });
    expect(keysOf(truck!)).toEqual(TRUCK_KEYS);
    expect(await readTruck(id)).toEqual({ ...before, is_active: false });
  });

  // An inactive truck keeps its history: nothing here deletes, and `locations` keeps its rows.
  it("keeps a truck's locations when it is set inactive", async () => {
    const id = await seedTruck("Med historik");
    const location = await seedLocation(id);

    await updateTruck(id, { is_active: false });

    const { data, error } = await supabaseAdmin.from("locations").select("id").eq("truck_id", id);
    if (error) throw error;
    expect(data.map((row) => row.id)).toEqual([location.id]);
  });

  it("writes only the patch's own columns", async () => {
    const id = await seedTruck("Bara namnet");
    const before = await readTruck(id);

    await updateTruck(id, { name: `${FIXTURE_PREFIX}Nytt namn`, created_at: "2000-01-01T00:00:00Z" } as never);

    expect(await readTruck(id)).toEqual({ ...before, name: `${FIXTURE_PREFIX}Nytt namn` });
  });

  it("returns null for an unknown id", async () => {
    expect(await updateTruck(randomUUID(), { is_active: false })).toBeNull();
  });

  it("raises 23505 for a handle another truck has", async () => {
    await insert(NEW_TRUCK);
    const id = await seedTruck("Kopia");

    await expect(updateTruck(id, { instagram_handle: NEW_TRUCK.instagram_handle })).rejects.toMatchObject({ code: "23505" });
  });

  it.each([
    ["an empty patch", {}],
    ["a patch of undefined values", { name: undefined }],
    ["a patch of unknown keys", { id: "x" } as never],
  ])("throws on %s, before any request", async (_, patch) => {
    await expect(updateTruck(randomUUID(), patch)).rejects.toThrow(/sets no column/);
  });
});
