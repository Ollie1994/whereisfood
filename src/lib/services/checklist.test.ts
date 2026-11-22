import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Location, Truck } from "@/lib/types";

// `getChecklist`'s own rules (Phase 7 plan, #22, #30, #31), with the db layer stubbed by an
// in-memory table that applies `findLocationsOverlapping`'s half-open overlap and order.
// `tests/integration/api-admin-checklist.test.ts` runs it against the local stack.
const db = {
  rows: [] as Location[],
  trucks: [] as Truck[],
  findLocationsOverlapping: vi.fn(),
  listActiveTrucks: vi.fn(),
};
vi.mock("@/lib/db/locations", () => ({
  findLocationsOverlapping: (...args: unknown[]) => db.findLocationsOverlapping(...args),
}));
vi.mock("@/lib/db/trucks", () => ({
  listActiveTrucks: (...args: unknown[]) => db.listActiveTrucks(...args),
}));

const { LOOK_BACK_WEEKS, getChecklist } = await import("@/lib/services/checklist");

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

function truck(id: string, name: string): Truck {
  return {
    id,
    name,
    instagram_handle: null,
    cuisine_type: null,
    description: null,
    is_active: true,
    created_at: "2026-01-01T00:00:00+00:00",
  };
}

let ids = 0;
// A live row, its timestamps as PostgREST writes them.
function row(truckId: string, startsAt: string, endsAt: string, overrides: Partial<Location> = {}): Location {
  ids += 1;
  return {
    id: `00000000-0000-4000-8000-${String(ids).padStart(12, "0")}`,
    truck_id: truckId,
    latitude: 57.7043702,
    longitude: 11.9697598,
    label: "Kungsportsplatsen",
    starts_at: startsAt.replace("Z", "+00:00"),
    ends_at: endsAt.replace("Z", "+00:00"),
    cancelled_at: null,
    source: "admin",
    created_at: "2026-01-01T00:00:00+00:00",
    updated_at: "2026-01-01T00:00:00+00:00",
    ...overrides,
  };
}

const iso = (s: string) => new Date(s).toISOString();
const windows = (checklist: { suggestions: { truck_id: string; starts_at: string; ends_at: string }[] }) =>
  checklist.suggestions.map(({ truck_id, starts_at, ends_at }) => [truck_id, starts_at, ends_at]);

// Wednesday 2026-08-26, 08:00 Stockholm (CEST, UTC+2). The weeks back: 08-19, 08-12, 08-05,
// 07-29; 07-22 is the fifth.
const NOW = new Date("2026-08-26T06:00:00Z");

beforeEach(() => {
  db.rows = [];
  db.trucks = [truck(A, "Burgarbilen"), truck(B, "Taco Loco")];
  db.findLocationsOverlapping.mockReset().mockImplementation(async (from: string, to: string) =>
    db.rows
      .filter((r) => Date.parse(r.starts_at) < Date.parse(to) && Date.parse(r.ends_at) > Date.parse(from))
      .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at) || a.id.localeCompare(b.id)),
  );
  db.listActiveTrucks.mockReset().mockImplementation(async () => db.trucks);
});

describe("getChecklist", () => {
  it("moves last week's entry to today by wall clock, and says which entry it came from", async () => {
    const source = row(A, "2026-08-19T09:00:00Z", "2026-08-19T12:00:00Z");
    db.rows = [source];

    const checklist = await getChecklist(NOW);

    expect(checklist.day).toBe("2026-08-26");
    expect(checklist.suggestions).toEqual([
      {
        truck_id: A,
        truck_name: "Burgarbilen",
        latitude: source.latitude,
        longitude: source.longitude,
        label: "Kungsportsplatsen",
        starts_at: iso("2026-08-26T09:00:00Z"),
        ends_at: iso("2026-08-26T12:00:00Z"),
        from_id: source.id,
        from_starts_at: source.starts_at,
      },
    ]);
  });

  it("reads one whole Stockholm day per week, LOOK_BACK_WEEKS of them, then today's rows", async () => {
    db.rows = [row(A, "2026-08-19T09:00:00Z", "2026-08-19T12:00:00Z")];

    await getChecklist(NOW);

    const calls = db.findLocationsOverlapping.mock.calls;
    expect(LOOK_BACK_WEEKS).toBe(4);
    expect(calls.slice(0, 4)).toEqual([
      [iso("2026-08-18T22:00:00Z"), iso("2026-08-19T22:00:00Z")],
      [iso("2026-08-11T22:00:00Z"), iso("2026-08-12T22:00:00Z")],
      [iso("2026-08-04T22:00:00Z"), iso("2026-08-05T22:00:00Z")],
      [iso("2026-07-28T22:00:00Z"), iso("2026-07-29T22:00:00Z")],
    ]);
    // The suggestion's own window, for the overlap with what the truck has now.
    expect(calls[4]).toEqual([iso("2026-08-26T09:00:00Z"), iso("2026-08-26T12:00:00Z")]);
    expect(calls).toHaveLength(5);
  });

  it("suggests every entry of the most recent matching day: lunch and dinner", async () => {
    db.rows = [
      row(A, "2026-08-19T09:00:00Z", "2026-08-19T11:00:00Z"),
      row(A, "2026-08-19T15:00:00Z", "2026-08-19T17:00:00Z", { label: "Heden" }),
      // An older week, with its own place: the most recent day wins.
      row(A, "2026-08-12T10:00:00Z", "2026-08-12T12:00:00Z", { label: "Lindholmen" }),
    ];

    const { suggestions } = await getChecklist(NOW);

    expect(suggestions.map((s) => [s.label, s.starts_at, s.ends_at])).toEqual([
      ["Kungsportsplatsen", iso("2026-08-26T09:00:00Z"), iso("2026-08-26T11:00:00Z")],
      ["Heden", iso("2026-08-26T15:00:00Z"), iso("2026-08-26T17:00:00Z")],
    ]);
  });

  it("takes only the most recent day, even when an older one had more entries", async () => {
    db.rows = [
      row(A, "2026-08-12T09:00:00Z", "2026-08-12T11:00:00Z"),
      row(A, "2026-08-12T15:00:00Z", "2026-08-12T17:00:00Z"),
      row(A, "2026-08-05T09:00:00Z", "2026-08-05T11:00:00Z"),
    ];

    expect(windows(await getChecklist(NOW))).toEqual([
      [A, iso("2026-08-26T09:00:00Z"), iso("2026-08-26T11:00:00Z")],
      [A, iso("2026-08-26T15:00:00Z"), iso("2026-08-26T17:00:00Z")],
    ]);
  });

  it("looks back four weeks and no further", async () => {
    db.rows = [row(A, "2026-07-29T09:00:00Z", "2026-07-29T12:00:00Z")];
    expect(windows(await getChecklist(NOW))).toEqual([[A, iso("2026-08-26T09:00:00Z"), iso("2026-08-26T12:00:00Z")]]);

    db.rows = [row(A, "2026-07-22T09:00:00Z", "2026-07-22T12:00:00Z")];
    expect((await getChecklist(NOW)).suggestions).toEqual([]);
  });

  it("doesn't count a row that started the day before and runs into the matching day", async () => {
    db.rows = [
      // Tuesday 08-18 22:00 to Wednesday 08-19 02:00 Stockholm.
      row(A, "2026-08-18T20:00:00Z", "2026-08-19T00:00:00Z"),
      row(A, "2026-08-12T09:00:00Z", "2026-08-12T12:00:00Z"),
    ];

    expect(windows(await getChecklist(NOW))).toEqual([[A, iso("2026-08-26T09:00:00Z"), iso("2026-08-26T12:00:00Z")]]);
  });

  it("keeps a shift past midnight ending on the next day (#30)", async () => {
    // Wednesday 08-19 22:00 to Thursday 02:00 Stockholm.
    db.rows = [row(A, "2026-08-19T20:00:00Z", "2026-08-20T00:00:00Z")];

    expect(windows(await getChecklist(NOW))).toEqual([[A, iso("2026-08-26T20:00:00Z"), iso("2026-08-27T00:00:00Z")]]);
  });

  it("finds last week's weekday across the spring change, where now - 168 h is the Sunday (#31)", async () => {
    // Monday 2026-03-30 00:30 CEST. Minus 168 h is Sunday 03-22 23:30 CET.
    const now = new Date("2026-03-29T22:30:00Z");
    db.rows = [
      // Monday 03-23 11:00–14:00 CET.
      row(A, "2026-03-23T10:00:00Z", "2026-03-23T13:00:00Z"),
      // Sunday 03-22, the day the 168 h reading lands on.
      row(B, "2026-03-22T10:00:00Z", "2026-03-22T13:00:00Z"),
    ];

    const checklist = await getChecklist(now);

    expect(checklist.day).toBe("2026-03-30");
    // 11:00–14:00 CEST.
    expect(windows(checklist)).toEqual([[A, iso("2026-03-30T09:00:00Z"), iso("2026-03-30T12:00:00Z")]]);
    expect(db.findLocationsOverlapping.mock.calls[0]).toEqual([iso("2026-03-22T23:00:00Z"), iso("2026-03-23T23:00:00Z")]);
  });

  it("keeps the wall-clock times across the autumn change", async () => {
    // Monday 2026-10-26 08:00 CET; last Monday 10-19 was CEST.
    const now = new Date("2026-10-26T07:00:00Z");
    db.rows = [row(A, "2026-10-19T09:00:00Z", "2026-10-19T12:00:00Z")];

    expect(windows(await getChecklist(now))).toEqual([[A, iso("2026-10-26T10:00:00Z"), iso("2026-10-26T13:00:00Z")]]);
  });

  it("leaves out an entry whose time today doesn't have", async () => {
    // Sunday 2026-03-29 00:30 CET: 02:00–02:59 doesn't exist today.
    const now = new Date("2026-03-28T23:30:00Z");
    db.rows = [
      // Sunday 03-22 02:30–04:00 CET.
      row(A, "2026-03-22T01:30:00Z", "2026-03-22T03:00:00Z"),
      row(B, "2026-03-22T10:00:00Z", "2026-03-22T13:00:00Z"),
    ];

    expect(windows(await getChecklist(now))).toEqual([[B, iso("2026-03-29T09:00:00Z"), iso("2026-03-29T12:00:00Z")]]);
  });

  it("leaves out an entry its own day's wall times can't rebuild: longer than a day, or with seconds", async () => {
    db.rows = [
      // Wednesday 11:00 to Thursday 12:00.
      row(A, "2026-08-19T09:00:00Z", "2026-08-20T10:00:00Z"),
      row(B, "2026-08-19T09:00:30Z", "2026-08-19T12:00:00Z"),
    ];

    expect((await getChecklist(NOW)).suggestions).toEqual([]);
  });

  it("leaves out an entry in the first copy of the repeated autumn hour, which the form can't show", async () => {
    // Sunday 2026-11-01 00:30 CET; last Sunday, 10-25, repeated 02:00–02:59.
    const now = new Date("2026-10-31T23:30:00Z");
    db.rows = [
      // 02:30 CEST, the first copy, to 05:00 CET.
      row(A, "2026-10-25T00:30:00Z", "2026-10-25T04:00:00Z"),
      // 02:30 CET, the second, to 05:00 CET.
      row(B, "2026-10-25T01:30:00Z", "2026-10-25T04:00:00Z"),
    ];

    // 02:30–05:00 on 11-01, which has no change: CET.
    expect(windows(await getChecklist(now))).toEqual([[B, iso("2026-11-01T01:30:00Z"), iso("2026-11-01T04:00:00Z")]]);
  });

  it("leaves out a suggestion that has already ended, and keeps one still running", async () => {
    // 15:30 Stockholm: lunch 11–14 has ended, 15–17 runs, dinner 17–19 is ahead.
    const now = new Date("2026-08-26T13:30:00Z");
    db.rows = [
      row(A, "2026-08-19T09:00:00Z", "2026-08-19T12:00:00Z"),
      row(A, "2026-08-19T13:00:00Z", "2026-08-19T15:00:00Z"),
      row(A, "2026-08-19T15:00:00Z", "2026-08-19T17:00:00Z"),
    ];

    expect(windows(await getChecklist(now))).toEqual([
      [A, iso("2026-08-26T13:00:00Z"), iso("2026-08-26T15:00:00Z")],
      [A, iso("2026-08-26T15:00:00Z"), iso("2026-08-26T17:00:00Z")],
    ]);
  });

  it("an end exactly now has ended", async () => {
    const now = new Date("2026-08-26T12:00:00Z");
    db.rows = [row(A, "2026-08-19T09:00:00Z", "2026-08-19T12:00:00Z")];

    expect((await getChecklist(now)).suggestions).toEqual([]);
  });

  it("leaves out a suggestion overlapping the truck's live entry, not another truck's or one that only touches", async () => {
    db.rows = [
      row(A, "2026-08-19T09:00:00Z", "2026-08-19T11:00:00Z"),
      row(A, "2026-08-19T15:00:00Z", "2026-08-19T17:00:00Z"),
      row(B, "2026-08-19T09:00:00Z", "2026-08-19T11:00:00Z"),
      // Today: A at lunch somewhere else, and B's 11:00–13:00 ending as its suggestion starts.
      row(A, "2026-08-26T09:30:00Z", "2026-08-26T10:30:00Z", { label: "Heden" }),
      row(B, "2026-08-26T07:00:00Z", "2026-08-26T09:00:00Z"),
    ];

    expect(windows(await getChecklist(NOW))).toEqual([
      [A, iso("2026-08-26T15:00:00Z"), iso("2026-08-26T17:00:00Z")],
      [B, iso("2026-08-26T09:00:00Z"), iso("2026-08-26T11:00:00Z")],
    ]);
  });

  it("leaves out a shift past midnight that overlaps the truck's entry tomorrow", async () => {
    db.rows = [
      row(A, "2026-08-19T20:00:00Z", "2026-08-20T00:00:00Z"),
      // Thursday 08-27 01:00–03:00 Stockholm.
      row(A, "2026-08-26T23:00:00Z", "2026-08-27T01:00:00Z"),
    ];

    expect((await getChecklist(NOW)).suggestions).toEqual([]);
  });

  it("lists the trucks in listActiveTrucks' order, each with its own most recent day", async () => {
    db.trucks = [truck(B, "Taco Loco"), truck(A, "Burgarbilen")];
    db.rows = [
      row(A, "2026-08-19T09:00:00Z", "2026-08-19T12:00:00Z"),
      row(B, "2026-08-05T10:00:00Z", "2026-08-05T12:00:00Z"),
    ];

    const { suggestions } = await getChecklist(NOW);

    expect(suggestions.map((s) => [s.truck_name, s.starts_at])).toEqual([
      ["Taco Loco", iso("2026-08-26T10:00:00Z")],
      ["Burgarbilen", iso("2026-08-26T09:00:00Z")],
    ]);
  });

  it("suggests nothing for a truck listActiveTrucks doesn't return", async () => {
    db.trucks = [truck(B, "Taco Loco")];
    db.rows = [row(A, "2026-08-19T09:00:00Z", "2026-08-19T12:00:00Z")];

    expect((await getChecklist(NOW)).suggestions).toEqual([]);
  });

  it("suggests nothing with no active truck, and reads no current rows", async () => {
    db.trucks = [];
    db.rows = [row(A, "2026-08-19T09:00:00Z", "2026-08-19T12:00:00Z")];
    expect(await getChecklist(NOW)).toEqual({ day: "2026-08-26", suggestions: [] });
    expect(db.findLocationsOverlapping).toHaveBeenCalledTimes(LOOK_BACK_WEEKS);
  });

  it("reads no current rows when an active truck's suggestions have all ended", async () => {
    // 15:00 Stockholm: last week's 11:00–14:00 has ended today.
    db.rows = [row(A, "2026-08-19T09:00:00Z", "2026-08-19T12:00:00Z")];
    expect((await getChecklist(new Date("2026-08-26T13:00:00Z"))).suggestions).toEqual([]);
    expect(db.findLocationsOverlapping).toHaveBeenCalledTimes(LOOK_BACK_WEEKS);
  });

  it("lets a db error through", async () => {
    db.findLocationsOverlapping.mockRejectedValue(new Error("boom"));
    await expect(getChecklist(NOW)).rejects.toThrow("boom");
  });
});
