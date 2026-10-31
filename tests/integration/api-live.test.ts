import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/live/route";
import type { LiveEntry, LiveResponse } from "@/lib/live";
import { getLiveMap } from "@/lib/services/live";
import { supabaseAdmin } from "@/lib/supabase";
import { keysOf, resetTables, seedLocation, seedTruck } from "./helpers";

// `GET /api/live` and its service against local Supabase. The error case (a throwing db
// layer → 500) is `src/app/api/live/route.test.ts`'s: it mocks the db layer, which would
// replace it for every test in this file.

// `LiveEntry`'s keys and its truck's, WRITTEN OUT like the db tests' key sets: a column
// leaking into the body (a spread row, a new field) adds a key, which only this catches.
const ENTRY_KEYS = ["ends_at", "id", "label", "latitude", "longitude", "starts_at", "truck", "updated_at"];
const ENTRY_TRUCK_KEYS = ["cuisine_type", "id", "instagram_handle", "name"];

const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();
// With a microsecond fraction (`…T10:00:00.123456Z`), so a truncation to milliseconds
// changes the text.
const micro = (ms: number) => iso(ms).replace(/Z$/, "456Z");

// A fixed `now` for the service's window tests: clear of the seed's rows (around the
// reset) and `seedLocation`'s default windows (2000 onwards, one a day).
const NOW = Date.parse("2030-06-15T10:00:00Z");

// The body's entry for location `id`; a missing one fails here, by name.
function entryOf(body: LiveResponse, id: string): LiveEntry {
  const entry = body.entries.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`no entry for location ${id} in the body`);
  return entry;
}

async function idsAt(now: number): Promise<string[]> {
  const { entries } = await getLiveMap(new Date(now));
  return entries.map((entry) => entry.id);
}

beforeEach(async () => {
  await resetTables();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/live", () => {
  it("answers 200 with exactly the cache header, and nothing that stops the CDN caching it", async () => {
    const res = await GET();

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, s-maxage=60, stale-while-revalidate=60");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("vary") ?? "").not.toMatch(/cookie/i);
  });

  it("returns { entries }, every entry and its truck with exactly LiveEntry's keys, nulls kept", async () => {
    const truckId = await seedTruck("Live");
    // Set here, not left to `seedTruck`'s defaults, so this test owns its null case.
    const { error } = await supabaseAdmin
      .from("trucks")
      .update({ instagram_handle: null, cuisine_type: null })
      .eq("id", truckId);
    if (error) throw error;
    const now = Date.now();
    const row = await seedLocation(truckId, {
      starts_at: iso(now - HOUR),
      ends_at: iso(now + HOUR),
      label: null,
    });

    const body = (await (await GET()).json()) as LiveResponse;

    expect(Object.keys(body)).toEqual(["entries"]);
    // Every entry, the seed's included, so no row of any truck leaks a column.
    for (const entry of body.entries) {
      expect(keysOf(entry)).toEqual(ENTRY_KEYS);
      expect(keysOf(entry.truck)).toEqual(ENTRY_TRUCK_KEYS);
    }
    // Each reaches the client as null, not a stand-in like "": `LiveEntry` types all
    // three `string | null`, and plan #13 has the popup leave a null label's line out.
    const ours = entryOf(body, row.id);
    expect([ours.truck.instagram_handle, ours.truck.cuisine_type, ours.label]).toEqual([null, null, null]);
  });

  it("fills each field from its own column", async () => {
    // Every source value distinct, so a field copied from the wrong column shows: the
    // truck's two strings differ, and the edit moves `updated_at` off `created_at` (the
    // `locations_updated_at` trigger), which an insert sets equal.
    const truckId = await seedTruck("Mapped");
    const { error } = await supabaseAdmin
      .from("trucks")
      .update({ instagram_handle: "mapped_truck", cuisine_type: "Thai" })
      .eq("id", truckId);
    if (error) throw error;
    const now = Date.now();
    const seeded = await seedLocation(truckId, { starts_at: micro(now - HOUR), ends_at: micro(now + HOUR) });
    const { data: row, error: editError } = await supabaseAdmin
      .from("locations")
      .update({ label: "Lindholmen" })
      .eq("id", seeded.id)
      .select()
      .single();
    if (editError) throw editError;
    expect(row.updated_at).not.toBe(row.created_at);

    const ours = entryOf((await (await GET()).json()) as LiveResponse, row.id);

    expect(ours.truck).toEqual({
      id: truckId,
      name: "itest-fixture-Mapped",
      instagram_handle: "mapped_truck",
      cuisine_type: "Thai",
    });
    expect([ours.latitude, ours.longitude, ours.label]).toEqual([row.latitude, row.longitude, "Lindholmen"]);
    // The exact strings: both sides come from PostgREST, and all three carry
    // microseconds (`micro` for the window, `now()` for `updated_at`), so a reformat or
    // a truncation shows here.
    expect([ours.starts_at, ours.ends_at, ours.updated_at]).toEqual([row.starts_at, row.ends_at, row.updated_at]);
  });
});

describe("getLiveMap's window, [now, now + 26 h)", () => {
  it("includes a row open at now and one starting just before now + 26 h", async () => {
    const truckId = await seedTruck();
    const open = await seedLocation(truckId, { starts_at: iso(NOW - HOUR), ends_at: iso(NOW + HOUR) });
    const late = await seedLocation(truckId, {
      starts_at: iso(NOW + 26 * HOUR - 60_000),
      ends_at: iso(NOW + 27 * HOUR),
    });

    expect(await idsAt(NOW)).toEqual(expect.arrayContaining([open.id, late.id]));
  });

  it("excludes a row starting at now + 26 h", async () => {
    const truckId = await seedTruck();
    const row = await seedLocation(truckId, { starts_at: iso(NOW + 26 * HOUR), ends_at: iso(NOW + 27 * HOUR) });

    expect(await idsAt(NOW)).not.toContain(row.id);
  });

  it("excludes a row that ended, including one ending exactly at now", async () => {
    const truckId = await seedTruck();
    const ended = await seedLocation(truckId, { starts_at: iso(NOW - 3 * HOUR), ends_at: iso(NOW - 2 * HOUR) });
    const endsNow = await seedLocation(truckId, { starts_at: iso(NOW - HOUR), ends_at: iso(NOW) });

    const ids = await idsAt(NOW);
    expect(ids).not.toContain(ended.id);
    expect(ids).not.toContain(endsNow.id);
  });

  it("excludes a cancelled row", async () => {
    const truckId = await seedTruck();
    const row = await seedLocation(truckId, {
      starts_at: iso(NOW - HOUR),
      ends_at: iso(NOW + HOUR),
      cancelled_at: iso(NOW - 2 * HOUR),
    });

    expect(await idsAt(NOW)).not.toContain(row.id);
  });

  it("excludes an inactive truck's row", async () => {
    const truckId = await seedTruck("Inactive", false);
    const row = await seedLocation(truckId, { starts_at: iso(NOW - HOUR), ends_at: iso(NOW + HOUR) });

    expect(await idsAt(NOW)).not.toContain(row.id);
  });

  it("includes, at 00:10 Stockholm on the 25-hour fall-back day, a row starting 23:30 that day", async () => {
    // 2026-10-25 00:10 CEST = 22:10Z the day before; 23:30 CET = 22:30Z, about
    // 24 h 20 min later. A 24-hour window would leave it out.
    const truckId = await seedTruck();
    const row = await seedLocation(truckId, {
      starts_at: "2026-10-25T22:30:00Z",
      ends_at: "2026-10-25T23:30:00Z",
    });

    expect(await idsAt(Date.parse("2026-10-24T22:10:00Z"))).toContain(row.id);
  });
});

describe("getLiveMap and rows the client's guard would reject (plan #20)", () => {
  it("leaves them out, logs each, and returns the valid row beside them", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const window = { starts_at: iso(NOW - HOUR), ends_at: iso(NOW + HOUR) };
    // The schema accepts both (probed on the local stack, PR #190).
    const infinite = await seedLocation(await seedTruck("Infinite"), { starts_at: window.starts_at, ends_at: "infinity" });
    const offMap = await seedLocation(await seedTruck("OffMap"), { ...window, latitude: 95 });
    const valid = await seedLocation(await seedTruck("Valid"), window);

    const ids = await idsAt(NOW);

    expect(ids).toContain(valid.id);
    expect(ids).not.toContain(infinite.id);
    expect(ids).not.toContain(offMap.id);
    const logged = warn.mock.calls.map((call) => String(call[0]));
    expect(logged.some((line) => line.includes(infinite.id))).toBe(true);
    expect(logged.some((line) => line.includes(offMap.id))).toBe(true);
  });
});
