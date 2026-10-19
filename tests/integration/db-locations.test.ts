import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  cancelLocation,
  findLocationsOverlapping,
  insertLocation,
  listRecentLocationsForTruck,
  updateLocation,
} from "@/lib/db/locations";
import { supabaseAdmin } from "@/lib/supabase";
import type { Location, LocationPatch, NewLocation } from "@/lib/types";
import { resetTables, seedLocation, seedTruck } from "./helpers";

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

function keysOf(row: Location): string[] {
  return Object.keys(row).sort();
}

// A Saturday lunch, 11:00–14:00 Stockholm (CEST), stored UTC. Every window here is after
// 2020, clear of `seedLocation`'s default windows (helpers.ts).
const LUNCH_START = "2026-08-22T09:00:00.000Z";
const LUNCH_END = "2026-08-22T12:00:00.000Z";

let truckId: string;

beforeEach(async () => {
  await resetTables();
  truckId = await seedTruck();
});

function aLocation(overrides: Partial<NewLocation> = {}): NewLocation {
  return {
    truck_id: truckId,
    latitude: 57.6998935,
    longitude: 11.952503,
    label: "Järntorget",
    starts_at: LUNCH_START,
    ends_at: LUNCH_END,
    source: "admin",
    created_by: null,
    ...overrides,
  };
}

async function readRow(id: string) {
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("label, starts_at, cancelled_at")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
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

  it("lets an overlap's 23P01 through with its code (open decision 5)", async () => {
    await insertLocation(aLocation());

    await expect(
      insertLocation(aLocation({ starts_at: "2026-08-22T11:00:00.000Z", ends_at: "2026-08-22T13:00:00.000Z" })),
    ).rejects.toMatchObject({ code: "23P01" });
  });
});

describe("updateLocation", () => {
  it("edits a live row and returns it with exactly the selected keys", async () => {
    const id = await seedLocation(truckId, { starts_at: LUNCH_START, ends_at: LUNCH_END });

    const updated = await updateLocation(id, {
      label: "Heden",
      ends_at: "2026-08-22T13:00:00.000Z",
    });

    expect(updated?.id).toBe(id);
    expect(updated?.label).toBe("Heden");
    expect(Date.parse(updated!.ends_at)).toBe(Date.parse("2026-08-22T13:00:00.000Z"));
    expect(keysOf(updated!)).toEqual(LOCATION_KEYS);
  });

  it("returns null for an unknown id", async () => {
    expect(await updateLocation(randomUUID(), { label: "Heden" })).toBeNull();
  });

  it("returns null for a cancelled row and leaves it unchanged", async () => {
    const id = await seedLocation(truckId, { cancelled_at: "2026-08-21T08:00:00.000Z" });

    expect(await updateLocation(id, { label: "Heden" })).toBeNull();
    expect((await readRow(id)).label).toBe("Järntorget");
  });

  it("lets an overlap's 23P01 through with its code (open decision 5)", async () => {
    await seedLocation(truckId, { starts_at: LUNCH_START, ends_at: LUNCH_END });
    const later = await seedLocation(truckId, {
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
    const id = await seedLocation(truckId);

    await expect(updateLocation(id, patch)).rejects.toThrow(/sets no column/);
    expect((await readRow(id)).label).toBe("Järntorget");
  });
});

describe("cancelLocation", () => {
  it("sets cancelled_at to the caller's timestamp and returns the row", async () => {
    const id = await seedLocation(truckId);

    const cancelled = await cancelLocation(id, "2026-08-22T08:00:00.000Z");

    expect(cancelled?.id).toBe(id);
    expect(Date.parse(cancelled!.cancelled_at!)).toBe(Date.parse("2026-08-22T08:00:00.000Z"));
    expect(keysOf(cancelled!)).toEqual(LOCATION_KEYS);
  });

  it("returns null for an already-cancelled row and keeps the first timestamp", async () => {
    const id = await seedLocation(truckId);
    await cancelLocation(id, "2026-08-22T08:00:00.000Z");

    expect(await cancelLocation(id, "2026-08-22T10:00:00.000Z")).toBeNull();
    expect(Date.parse((await readRow(id)).cancelled_at!)).toBe(
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

  it("finds live rows of every truck that overlap the window, with exactly the selected keys", async () => {
    const otherTruck = await seedTruck("Other");
    const mine = await seedLocation(truckId, { starts_at: LUNCH_START, ends_at: LUNCH_END });
    const theirs = await seedLocation(otherTruck, {
      starts_at: "2026-08-22T11:00:00.000Z",
      ends_at: "2026-08-22T15:00:00.000Z",
    });

    const { rows, ids } = await overlappingIds(
      "2026-08-22T10:00:00.000Z",
      "2026-08-22T11:30:00.000Z",
      [truckId, otherTruck],
    );

    expect(ids.sort()).toEqual([mine, theirs].sort());
    expect(keysOf(rows.find((row) => row.id === mine)!)).toEqual(LOCATION_KEYS);
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
    const day18 = await seedLocation(truckId, onDay(18));
    const day19 = await seedLocation(truckId, onDay(19));
    const day20 = await seedLocation(truckId, onDay(20));
    await seedLocation(truckId, { ...onDay(21), cancelled_at: "2026-08-20T08:00:00.000Z" });
    await seedLocation(truckId, onDay(23)); // starts after `before`
    await seedLocation(otherTruck, onDay(21));

    const recent = await listRecentLocationsForTruck(truckId, BEFORE, 10);
    expect(recent.map((row) => row.id)).toEqual([day20, day19, day18]);
    expect(keysOf(recent[0])).toEqual(LOCATION_KEYS);

    const limited = await listRecentLocationsForTruck(truckId, BEFORE, 2);
    expect(limited.map((row) => row.id)).toEqual([day20, day19]);
  });
});
