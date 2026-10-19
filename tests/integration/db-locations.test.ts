import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelLocation,
  findLocationsOverlapping,
  insertLocation,
  listRecentLocationsForTruck,
  updateLocation,
} from "@/lib/db/locations";
import { MAX_ROWS } from "@/lib/db/complete";
import { supabaseAdmin } from "@/lib/supabase";
import type { LocationPatch, NewLocation } from "@/lib/types";
import {
  FIXTURE_PLACE,
  keysOf,
  readLocation,
  resetTables,
  seedDailyLocations,
  seedLocation,
  seedTruck,
} from "./helpers";

// The keys every function's rows must have, WRITTEN OUT rather than derived from a
// type, which would grow with the table. No `created_by` (Phase 5 plan, #8). `tsc`
// catches a column missing from `LOCATION_COLUMNS`; only this catches an extra one
// (or a `*`).
const LOCATION_KEYS = [
  "cancelled_at",
  "created_at",
  "ends_at",
  "id",
  "label",
  "latitude",
  "longitude",
  "source",
  "starts_at",
  "truck_id",
  "updated_at",
];

// A Saturday lunch, 11:00–14:00 Stockholm (CEST), stored UTC. Every window here is after
// 2020, clear of `seedLocation`'s default windows (helpers.ts).
const LUNCH_START = "2026-08-22T09:00:00.000Z";
const LUNCH_END = "2026-08-22T12:00:00.000Z";

let truckId: string;

beforeEach(async () => {
  await resetTables();
  truckId = await seedTruck();
});

// A spy left behind by a failing assertion would count the next test's own requests.
afterEach(() => {
  vi.restoreAllMocks();
});

function aLocation(overrides: Partial<NewLocation> = {}): NewLocation {
  return {
    truck_id: truckId,
    ...FIXTURE_PLACE,
    starts_at: LUNCH_START,
    ends_at: LUNCH_END,
    source: "admin",
    created_by: null,
    ...overrides,
  };
}

describe("insertLocation", () => {
  it("returns the stored row, with its generated id and exactly the selected keys", async () => {
    const stored = await insertLocation(aLocation());

    expect(stored.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(stored.truck_id).toBe(truckId);
    expect(stored.cancelled_at).toBeNull();
    expect(keysOf(stored)).toEqual(LOCATION_KEYS);
    // Compared as instants: Postgres returns `…T09:00:00+00:00` for the
    // `…T09:00:00.000Z` we sent. The text isn't asserted; it is PostgREST's to choose.
    expect(Date.parse(stored.starts_at)).toBe(Date.parse(LUNCH_START));
  });

  it("writes only NewLocation's columns, even from a wider object", async () => {
    // A variable, not a literal: `tsc` checks excess keys only on a literal, so this
    // compiles, as a spread in a caller would.
    const wider = { ...aLocation(), id: randomUUID(), cancelled_at: "2026-08-21T08:00:00.000Z" };

    const stored = await insertLocation(wider);

    expect(stored.id).not.toBe(wider.id);
    expect(stored.cancelled_at).toBeNull();
  });

  it("lets an overlap's 23P01 through with its code (open decision 5)", async () => {
    await insertLocation(aLocation());

    await expect(
      insertLocation(aLocation({ starts_at: "2026-08-22T11:00:00.000Z", ends_at: "2026-08-22T13:00:00.000Z" })),
    ).rejects.toMatchObject({ code: "23P01" });
  });
});

describe("updateLocation", () => {
  it("edits a live row and returns it with exactly the selected keys", async () => {
    const { id } = await seedLocation(truckId, { starts_at: LUNCH_START, ends_at: LUNCH_END });

    const updated = await updateLocation(id, {
      label: "Heden",
      ends_at: "2026-08-22T13:00:00.000Z",
    });

    expect(updated?.id).toBe(id);
    expect(updated?.label).toBe("Heden");
    expect(Date.parse(updated!.ends_at)).toBe(Date.parse("2026-08-22T13:00:00.000Z"));
    expect(keysOf(updated!)).toEqual(LOCATION_KEYS);
  });

  it("writes only LocationPatch's columns, even from a wider object", async () => {
    const otherTruck = await seedTruck("Other");
    const row = await seedLocation(truckId);
    // A variable, not a literal, as in the insert case: `{ ...row, label }` compiles.
    const wider = {
      ...row,
      label: "Heden",
      truck_id: otherTruck,
      cancelled_at: "2026-08-21T08:00:00.000Z",
    };

    const updated = await updateLocation(row.id, wider);

    expect(updated?.label).toBe("Heden");
    expect(updated?.truck_id).toBe(truckId);
    expect(updated?.cancelled_at).toBeNull();
  });

  it("returns null for an unknown id", async () => {
    expect(await updateLocation(randomUUID(), { label: "Heden" })).toBeNull();
  });

  it("returns null for a cancelled row and leaves it unchanged", async () => {
    const { id } = await seedLocation(truckId, { cancelled_at: "2026-08-21T08:00:00.000Z" });

    expect(await updateLocation(id, { label: "Heden" })).toBeNull();
    expect((await readLocation(id)).label).toBe("Järntorget");
  });

  it("lets an overlap's 23P01 through with its code (open decision 5)", async () => {
    await seedLocation(truckId, { starts_at: LUNCH_START, ends_at: LUNCH_END });
    const { id: later } = await seedLocation(truckId, {
      starts_at: "2026-08-22T13:00:00.000Z",
      ends_at: "2026-08-22T15:00:00.000Z",
    });

    await expect(
      updateLocation(later, { starts_at: "2026-08-22T11:00:00.000Z" }),
    ).rejects.toMatchObject({ code: "23P01" });
  });

  // An empty PATCH updates no row, so without the guard these would return null for a
  // row that exists.
  it.each<[string, LocationPatch]>([
    ["{}", {}],
    ["a patch whose keys are all undefined", { label: undefined, ends_at: undefined }],
  ])("throws on %s and leaves the row unchanged", async (_name, patch) => {
    const { id } = await seedLocation(truckId);
    const from = vi.spyOn(supabaseAdmin, "from");

    await expect(updateLocation(id, patch)).rejects.toThrow(/sets no column/);
    // Before any request: the guard runs before the query is built.
    expect(from).not.toHaveBeenCalled();
    expect((await readLocation(id)).label).toBe("Järntorget");
  });
});

describe("cancelLocation", () => {
  it("sets cancelled_at to the caller's timestamp and returns the row", async () => {
    const { id } = await seedLocation(truckId);

    const cancelled = await cancelLocation(id, "2026-08-22T08:00:00.000Z");

    expect(cancelled?.id).toBe(id);
    expect(Date.parse(cancelled!.cancelled_at!)).toBe(Date.parse("2026-08-22T08:00:00.000Z"));
    expect(keysOf(cancelled!)).toEqual(LOCATION_KEYS);
  });

  it("returns null for an already-cancelled row and keeps the first timestamp", async () => {
    const { id } = await seedLocation(truckId);
    await cancelLocation(id, "2026-08-22T08:00:00.000Z");

    expect(await cancelLocation(id, "2026-08-22T10:00:00.000Z")).toBeNull();
    expect(Date.parse((await readLocation(id)).cancelled_at!)).toBe(
      Date.parse("2026-08-22T08:00:00.000Z"),
    );
  });

  it("returns null for an unknown id", async () => {
    expect(await cancelLocation(randomUUID(), "2026-08-22T08:00:00.000Z")).toBeNull();
  });
});

describe("findLocationsOverlapping", () => {
  // Returns every truck's rows, and seed rows may fall in any window a test picks, so
  // each assertion reads only this test's fixture trucks.
  async function overlappingIds(from: string, to: string, trucks: string[]) {
    const rows = await findLocationsOverlapping(from, to);
    return { rows, ids: rows.filter((row) => trucks.includes(row.truck_id)).map((row) => row.id) };
  }

  it("finds live rows of every truck that overlap the window, by starts_at, with exactly the selected keys", async () => {
    // The later-starting row is inserted first and ends first, so neither insertion order
    // nor the `ends_at` index gives `starts_at` order: only `.order("starts_at")` does.
    const otherTruck = await seedTruck("Other");
    const { id: theirs } = await seedLocation(otherTruck, {
      starts_at: "2026-08-22T11:00:00.000Z",
      ends_at: LUNCH_END,
    });
    const { id: mine } = await seedLocation(truckId, {
      starts_at: LUNCH_START,
      ends_at: "2026-08-22T16:00:00.000Z",
    });

    const { rows, ids } = await overlappingIds(
      "2026-08-22T10:00:00.000Z",
      "2026-08-22T11:30:00.000Z",
      [truckId, otherTruck],
    );

    expect(ids).toEqual([mine, theirs]);
    expect(keysOf(rows.find((row) => row.id === mine)!)).toEqual(LOCATION_KEYS);
  });

  it("breaks a starts_at tie by id", async () => {
    // Inserted in the reverse of id order, so insertion order alone gives the wrong one.
    const otherTruck = await seedTruck("Other");
    const high = "ffffffff-ffff-4fff-bfff-ffffffffffff";
    const low = "00000000-0000-4000-8000-000000000000";
    await seedLocation(truckId, { id: high, starts_at: LUNCH_START, ends_at: LUNCH_END });
    await seedLocation(otherTruck, { id: low, starts_at: LUNCH_START, ends_at: LUNCH_END });

    expect((await overlappingIds(LUNCH_START, LUNCH_END, [truckId, otherTruck])).ids).toEqual([
      low,
      high,
    ]);
  });

  it("leaves out a cancelled row", async () => {
    await seedLocation(truckId, {
      starts_at: LUNCH_START,
      ends_at: LUNCH_END,
      cancelled_at: "2026-08-21T08:00:00.000Z",
    });

    expect((await overlappingIds(LUNCH_START, LUNCH_END, [truckId])).ids).toEqual([]);
  });

  it("is half-open: a row ending at `from` or starting at `to` is out", async () => {
    await seedLocation(truckId, { starts_at: "2026-08-22T06:00:00.000Z", ends_at: LUNCH_START });
    await seedLocation(truckId, { starts_at: LUNCH_END, ends_at: "2026-08-22T15:00:00.000Z" });

    expect((await overlappingIds(LUNCH_START, LUNCH_END, [truckId])).ids).toEqual([]);
  });
});

describe("listRecentLocationsForTruck", () => {
  const BEFORE = "2026-08-22T00:00:00.000Z";

  // Day `n` of August 2026, 09:00–12:00 UTC.
  function onDay(n: number): Pick<NewLocation, "starts_at" | "ends_at"> {
    const day = String(n).padStart(2, "0");
    return { starts_at: `2026-08-${day}T09:00:00.000Z`, ends_at: `2026-08-${day}T12:00:00.000Z` };
  }

  it("returns the truck's live rows that started before `before`, newest first, up to `limit`", async () => {
    const otherTruck = await seedTruck("Other");
    const { id: day18 } = await seedLocation(truckId, onDay(18));
    const { id: day19 } = await seedLocation(truckId, onDay(19));
    const { id: day20 } = await seedLocation(truckId, onDay(20));
    await seedLocation(truckId, { ...onDay(21), cancelled_at: "2026-08-20T08:00:00.000Z" });
    await seedLocation(truckId, onDay(23)); // starts after `before`
    await seedLocation(truckId, { starts_at: BEFORE, ends_at: "2026-08-22T03:00:00.000Z" }); // starts at `before`
    await seedLocation(otherTruck, onDay(21));

    const recent = await listRecentLocationsForTruck(truckId, BEFORE, 10);
    expect(recent.map((row) => row.id)).toEqual([day20, day19, day18]);
    expect(keysOf(recent[0])).toEqual(LOCATION_KEYS);

    const limited = await listRecentLocationsForTruck(truckId, BEFORE, 2);
    expect(limited.map((row) => row.id)).toEqual([day20, day19]);
  });

  it.each([0, -1, 1.5, 1001])("throws on limit %s before any request", async (limit) => {
    const from = vi.spyOn(supabaseAdmin, "from");

    await expect(listRecentLocationsForTruck(truckId, BEFORE, limit)).rejects.toThrow(
      /integer from 1 to 1000/,
    );
    expect(from).not.toHaveBeenCalled();
  });
});

// ⚠ LAST IN THE FILE, AND IT HAS TO BE. Their 1001 rows leave the table at 19 pages until
// autovacuum runs, and on a table that size the planner reads "recent places" off the
// `(truck_id, starts_at desc)` index, which returns newest first with or without the
// ORDER BY. Measured 2026-10-19 with `.order(…)` removed from
// `listRecentLocationsForTruck`: its test failed at 1 page, passed at 19, failed again
// after `vacuum`. So these tests run after the order tests. A re-run before autovacuum
// (about a minute) still meets the 19-page table: that run can't catch a missing ORDER BY.
describe("findLocationsOverlapping at the API's max_rows", () => {
  it("throws when the API's max_rows would cut the result short", async () => {
    // 1001 rows, one a day from 2040-01-01: one more than `max_rows` in
    // `supabase/config.toml`. Without the check, the first 1000 come back with no error.
    await seedDailyLocations(truckId, "2040-01-01T00:00:00.000Z", 1001);

    await expect(
      findLocationsOverlapping("2040-01-01T00:00:00.000Z", "2043-01-01T00:00:00.000Z"),
    ).rejects.toThrow(/1000 of 1001 rows/);
  }, 30_000);

  it("returns every row at limit = MAX_ROWS, so the API's cap is no lower", async () => {
    // `listRecentLocationsForTruck` rejects a limit above MAX_ROWS instead of checking for
    // a cut; this holds only while the running API returns at least MAX_ROWS rows.
    await seedDailyLocations(truckId, "2040-01-01T00:00:00.000Z", 1001);

    expect(
      await listRecentLocationsForTruck(truckId, "2050-01-01T00:00:00.000Z", MAX_ROWS),
    ).toHaveLength(MAX_ROWS);
  }, 30_000);
});
