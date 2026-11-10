import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Location, Truck } from "@/lib/types";

// The service's own decisions, with the db layer stubbed: the merged-row checks, decision
// #33's refusals and the conflict text. `tests/integration/api-admin-locations.test.ts`
// runs the same paths against the local stack.
const db = {
  cancelLocation: vi.fn(),
  confirmLocation: vi.fn(),
  findLocationsOverlapping: vi.fn(),
  findTruckLocationsOverlapping: vi.fn(),
  getLocationById: vi.fn(),
  insertLocation: vi.fn(),
  listRecentLocationsForTruck: vi.fn(),
  updateLocation: vi.fn(),
  getActiveTruckById: vi.fn(),
  listAllTrucks: vi.fn(),
};
vi.mock("@/lib/db/locations", () => ({
  cancelLocation: (...args: unknown[]) => db.cancelLocation(...args),
  confirmLocation: (...args: unknown[]) => db.confirmLocation(...args),
  findLocationsOverlapping: (...args: unknown[]) => db.findLocationsOverlapping(...args),
  findTruckLocationsOverlapping: (...args: unknown[]) => db.findTruckLocationsOverlapping(...args),
  getLocationById: (...args: unknown[]) => db.getLocationById(...args),
  insertLocation: (...args: unknown[]) => db.insertLocation(...args),
  listRecentLocationsForTruck: (...args: unknown[]) => db.listRecentLocationsForTruck(...args),
  updateLocation: (...args: unknown[]) => db.updateLocation(...args),
}));
vi.mock("@/lib/db/trucks", () => ({
  getActiveTruckById: (...args: unknown[]) => db.getActiveTruckById(...args),
  listAllTrucks: (...args: unknown[]) => db.listAllTrucks(...args),
}));

const {
  ENTRY_ERRORS,
  RECENT_ENTRIES,
  RECENT_PLACES,
  cancelEntry,
  confirmEntry,
  createEntry,
  editEntry,
  getRecentPlaces,
  listAdminEntries,
} = await import(
  "@/lib/services/locations"
);
const { LOCATION_ERRORS } = await import("@/lib/validators/location");

const TRUCK = "11111111-1111-1111-1111-111111111111";
const ADMIN = "00000000-0000-4000-8000-000000000001";
const ID = "22222222-2222-4222-8222-222222222222";
// 10:00 Stockholm (CEST) on the day of the lunch below.
const NOW = new Date("2026-08-22T08:00:00.000Z");

// 11:00–14:00 Stockholm, stored UTC.
const INPUT = {
  truck_id: TRUCK,
  latitude: 57.6998935,
  longitude: 11.952503,
  label: "Järntorget",
  starts_at: "2026-08-22T09:00:00.000Z",
  ends_at: "2026-08-22T12:00:00.000Z",
};

function row(overrides: Partial<Location> = {}): Location {
  return {
    id: ID,
    ...INPUT,
    // As PostgREST writes timestamps: the service compares instants, not text.
    starts_at: "2026-08-22T09:00:00+00:00",
    ends_at: "2026-08-22T12:00:00+00:00",
    cancelled_at: null,
    source: "admin",
    created_at: "2026-08-21T08:00:00+00:00",
    updated_at: "2026-08-21T08:00:00+00:00",
    ...overrides,
  };
}

const overlapError = Object.assign(new Error("conflicting key value violates exclusion constraint"), { code: "23P01" });

beforeEach(() => {
  for (const fn of Object.values(db)) fn.mockReset();
});

describe("createEntry", () => {
  it("inserts with source admin and created_by the admin, never the client's", async () => {
    db.getActiveTruckById.mockResolvedValue({ id: TRUCK });
    db.insertLocation.mockResolvedValue(row());

    expect(await createEntry(INPUT, ADMIN, NOW)).toEqual({ ok: true, entry: row() });
    expect(db.insertLocation).toHaveBeenCalledWith({ ...INPUT, source: "admin", created_by: ADMIN });
  });

  it("refuses an inactive or unknown truck, with no insert", async () => {
    db.getActiveTruckById.mockResolvedValue(null);

    expect(await createEntry(INPUT, ADMIN, NOW)).toEqual({ ok: false, reason: "invalid", error: ENTRY_ERRORS.truck });
    expect(db.insertLocation).not.toHaveBeenCalled();
  });

  // #33: an entry that has already ended is refused; one in progress is fine.
  it.each([
    ["ends now", "2026-08-22T08:00:00.000Z", false],
    ["ended a minute ago", "2026-08-22T07:59:00.000Z", false],
    ["is in progress", "2026-08-22T08:01:00.000Z", true],
  ])("an entry that %s is %s", async (_, endsAt, accepted) => {
    db.getActiveTruckById.mockResolvedValue({ id: TRUCK });
    db.insertLocation.mockResolvedValue(row());
    const input = { ...INPUT, starts_at: "2026-08-22T07:00:00.000Z", ends_at: endsAt };

    const result = await createEntry(input, ADMIN, NOW);

    expect(result.ok).toBe(accepted);
    if (!result.ok) expect(result).toEqual({ ok: false, reason: "invalid", error: ENTRY_ERRORS.ended });
    expect(db.insertLocation).toHaveBeenCalledTimes(accepted ? 1 : 0);
  });

  it("answers an overlap with the truck's other entry, in Stockholm time", async () => {
    db.getActiveTruckById.mockResolvedValue({ id: TRUCK });
    db.insertLocation.mockRejectedValue(overlapError);
    db.findTruckLocationsOverlapping.mockResolvedValue([
      row({ id: "55555555-5555-4555-8555-555555555555", starts_at: "2026-08-22T10:00:00+00:00", ends_at: "2026-08-22T13:30:00+00:00" }),
    ]);

    expect(await createEntry(INPUT, ADMIN, NOW)).toEqual({
      ok: false,
      reason: "conflict",
      error: "Överlappar med 2026-08-22 12:00–15:30 — redigera den istället",
    });
    // The truck's rows only, two at most: never every truck's, which can pass `max_rows`.
    expect(db.findTruckLocationsOverlapping).toHaveBeenCalledWith(TRUCK, INPUT.starts_at, INPUT.ends_at, 2);
    expect(db.findLocationsOverlapping).not.toHaveBeenCalled();
  });

  it("names the end's date when the other entry ends on another day", async () => {
    db.getActiveTruckById.mockResolvedValue({ id: TRUCK });
    db.insertLocation.mockRejectedValue(overlapError);
    db.findTruckLocationsOverlapping.mockResolvedValue([
      row({ starts_at: "2026-08-22T20:00:00+00:00", ends_at: "2026-08-22T23:00:00+00:00" }),
    ]);

    const result = await createEntry(INPUT, ADMIN, NOW);

    expect(result).toMatchObject({ error: "Överlappar med 2026-08-22 22:00–2026-08-23 01:00 — redigera den istället" });
  });

  // #33 refuses to edit an ended entry, so the text points to this one instead.
  it("tells the admin to change this entry's time when the other one has ended", async () => {
    db.getActiveTruckById.mockResolvedValue({ id: TRUCK });
    db.insertLocation.mockRejectedValue(overlapError);
    db.findTruckLocationsOverlapping.mockResolvedValue([
      row({ starts_at: "2026-08-22T05:00:00+00:00", ends_at: "2026-08-22T07:30:00+00:00" }),
    ]);
    const input = { ...INPUT, starts_at: "2026-08-22T07:00:00.000Z" };

    expect(await createEntry(input, ADMIN, NOW)).toEqual({
      ok: false,
      reason: "conflict",
      error: "Överlappar med 2026-08-22 07:00–09:30, som redan har slutat. Ändra tiden på den här posten.",
    });
  });

  // The other entry runs 09:00–12:00 Stockholm and it is 10:00. Ending it at this entry's
  // start would end it in the past, which #33 refuses; moving that start past now wouldn't.
  it.each([
    ["starts by now", "2026-08-22T07:30:00.000Z", ", som pågår nu. Ändra tiden på den här posten."],
    ["starts after now", "2026-08-22T09:00:00.000Z", " — redigera den istället"],
  ])("with the other entry running, a new entry that %s gets its own advice", async (_, startsAt, advice) => {
    db.getActiveTruckById.mockResolvedValue({ id: TRUCK });
    db.insertLocation.mockRejectedValue(overlapError);
    db.findTruckLocationsOverlapping.mockResolvedValue([
      row({ starts_at: "2026-08-22T07:00:00+00:00", ends_at: "2026-08-22T10:00:00+00:00" }),
    ]);

    expect(await createEntry({ ...INPUT, starts_at: startsAt }, ADMIN, NOW)).toEqual({
      ok: false,
      reason: "conflict",
      error: `Överlappar med 2026-08-22 09:00–12:00${advice}`,
    });
  });

  it("gives the plain overlap text when the other entry is gone by the time it is read", async () => {
    db.getActiveTruckById.mockResolvedValue({ id: TRUCK });
    db.insertLocation.mockRejectedValue(overlapError);
    db.findTruckLocationsOverlapping.mockResolvedValue([]);

    expect(await createEntry(INPUT, ADMIN, NOW)).toEqual({ ok: false, reason: "conflict", error: ENTRY_ERRORS.overlap });
  });

  it("lets any other database error through", async () => {
    db.getActiveTruckById.mockResolvedValue({ id: TRUCK });
    const other = Object.assign(new Error("boom"), { code: "23514" });
    db.insertLocation.mockRejectedValue(other);

    await expect(createEntry(INPUT, ADMIN, NOW)).rejects.toBe(other);
  });
});

describe("editEntry", () => {
  it("updates with the patch alone and returns the entry", async () => {
    db.getLocationById.mockResolvedValue(row());
    db.updateLocation.mockResolvedValue(row({ label: "Heden" }));

    expect(await editEntry(ID, { label: "Heden" }, NOW)).toEqual({ ok: true, entry: row({ label: "Heden" }) });
    expect(db.updateLocation).toHaveBeenCalledWith(ID, { label: "Heden" });
  });

  it("is not-found for a missing or cancelled entry, with no update", async () => {
    db.getLocationById.mockResolvedValue(null);

    expect(await editEntry(ID, { label: "Heden" }, NOW)).toEqual({
      ok: false,
      reason: "not-found",
      error: ENTRY_ERRORS.notFound,
    });
    expect(db.updateLocation).not.toHaveBeenCalled();
  });

  it("is not-found when the entry is cancelled between the read and the write", async () => {
    db.getLocationById.mockResolvedValue(row());
    db.updateLocation.mockResolvedValue(null);

    expect(await editEntry(ID, { label: "Heden" }, NOW)).toMatchObject({ reason: "not-found" });
  });

  // The merged entry is checked, so a patch with one field is refused before `23514`.
  it.each([
    ["an end before the stored start", { ends_at: "2026-08-22T08:30:00.000Z" }, LOCATION_ERRORS.order],
    ["a start after the stored end", { starts_at: "2026-08-22T13:00:00.000Z" }, LOCATION_ERRORS.order],
    ["a latitude outside Gothenburg", { latitude: 59.3293 }, LOCATION_ERRORS.outside],
    ["a longitude outside Gothenburg", { longitude: 18.0686 }, LOCATION_ERRORS.outside],
  ])("refuses %s, with no update", async (_, patch, error) => {
    db.getLocationById.mockResolvedValue(row());

    expect(await editEntry(ID, patch, NOW)).toEqual({ ok: false, reason: "invalid", error });
    expect(db.updateLocation).not.toHaveBeenCalled();
  });

  // #33.
  it("refuses to edit an entry that has ended", async () => {
    db.getLocationById.mockResolvedValue(row({ ends_at: "2026-08-22T08:00:00+00:00", starts_at: "2026-08-22T06:00:00+00:00" }));

    expect(await editEntry(ID, { label: "Heden" }, NOW)).toEqual({
      ok: false,
      reason: "invalid",
      error: ENTRY_ERRORS.endedEdit,
    });
    expect(db.updateLocation).not.toHaveBeenCalled();
  });

  it("edits an entry in progress, but not to an end already passed", async () => {
    db.getLocationById.mockResolvedValue(row({ starts_at: "2026-08-22T07:00:00+00:00" }));
    db.updateLocation.mockResolvedValue(row());

    expect(await editEntry(ID, { label: "Heden" }, NOW)).toMatchObject({ ok: true });
    expect(await editEntry(ID, { ends_at: "2026-08-22T07:30:00.000Z" }, NOW)).toEqual({
      ok: false,
      reason: "invalid",
      error: ENTRY_ERRORS.ended,
    });
    expect(db.updateLocation).toHaveBeenCalledTimes(1);
  });

  it("answers an overlap naming the truck's other entry, never the one being edited", async () => {
    db.getLocationById.mockResolvedValue(row());
    db.updateLocation.mockRejectedValue(overlapError);
    db.findTruckLocationsOverlapping.mockResolvedValue([
      row(),
      row({ id: "55555555-5555-4555-8555-555555555555", starts_at: "2026-08-22T12:00:00+00:00", ends_at: "2026-08-22T14:00:00+00:00" }),
    ]);

    expect(await editEntry(ID, { ends_at: "2026-08-22T13:00:00.000Z" }, NOW)).toEqual({
      ok: false,
      reason: "conflict",
      error: "Överlappar med 2026-08-22 14:00–16:00 — redigera den istället",
    });
    // The merged window, not the patch.
    expect(db.findTruckLocationsOverlapping).toHaveBeenCalledWith(
      TRUCK,
      "2026-08-22T09:00:00+00:00",
      "2026-08-22T13:00:00.000Z",
      2,
    );
  });

  // The edit path passes its own `now` to the advice too.
  it("tells the admin to change this entry's time when an edit overlaps an ended entry", async () => {
    db.getLocationById.mockResolvedValue(row({ starts_at: "2026-08-22T08:30:00+00:00" }));
    db.updateLocation.mockRejectedValue(overlapError);
    db.findTruckLocationsOverlapping.mockResolvedValue([
      row({ id: "55555555-5555-4555-8555-555555555555", starts_at: "2026-08-22T06:00:00+00:00", ends_at: "2026-08-22T07:30:00+00:00" }),
    ]);

    expect(await editEntry(ID, { starts_at: "2026-08-22T07:00:00.000Z" }, NOW)).toEqual({
      ok: false,
      reason: "conflict",
      error: "Överlappar med 2026-08-22 08:00–09:30, som redan har slutat. Ändra tiden på den här posten.",
    });
  });

  // Only the patch is written, so another tab's edit of the other field stays.
  it("writes one time alone, not the time it read beside it", async () => {
    db.getLocationById.mockResolvedValue(row());
    db.updateLocation.mockResolvedValue(row());

    await editEntry(ID, { ends_at: "2026-08-22T12:30:00.000Z" }, NOW);

    expect(db.updateLocation).toHaveBeenCalledWith(ID, { ends_at: "2026-08-22T12:30:00.000Z" });
  });

  // Another tab moved the start past this patch's end between the read and the write. The
  // message is Postgres's, as `db-locations.test.ts` pins its constraint name.
  it("answers the order CHECK's 23514 with the order message, not a 500", async () => {
    db.getLocationById.mockResolvedValue(row());
    db.updateLocation.mockRejectedValue(
      Object.assign(
        new Error('new row for relation "locations" violates check constraint "locations_ends_after_starts"'),
        { code: "23514" },
      ),
    );

    expect(await editEntry(ID, { ends_at: "2026-08-22T12:30:00.000Z" }, NOW)).toEqual({
      ok: false,
      reason: "invalid",
      error: LOCATION_ERRORS.order,
    });
  });

  it.each([
    ["another CHECK's 23514", Object.assign(new Error('violates check constraint "locations_other"'), { code: "23514" })],
    ["any other database error", Object.assign(new Error("boom"), { code: "22P02" })],
  ])("lets %s through", async (_, error) => {
    db.getLocationById.mockResolvedValue(row());
    db.updateLocation.mockRejectedValue(error);

    await expect(editEntry(ID, { label: "Heden" }, NOW)).rejects.toBe(error);
  });

  // Another tab moved the start to 08:00 after this tab read 11:00–14:00; this patch's end
  // then makes the stored window 08:00–15:00, which overlaps an 08:30 entry.
  it("names the overlap from the stored window plus the patch, not this tab's read", async () => {
    db.getLocationById
      .mockResolvedValueOnce(row())
      .mockResolvedValueOnce(row({ starts_at: "2026-08-22T06:00:00+00:00" }));
    db.updateLocation.mockRejectedValue(overlapError);
    db.findTruckLocationsOverlapping.mockResolvedValue([]);

    await editEntry(ID, { ends_at: "2026-08-22T13:00:00.000Z" }, NOW);

    expect(db.findTruckLocationsOverlapping).toHaveBeenCalledWith(
      TRUCK,
      "2026-08-22T06:00:00+00:00",
      "2026-08-22T13:00:00.000Z",
      2,
    );
  });
});

describe("cancelEntry and confirmEntry", () => {
  it("pass the id and now to the db layer, and its null through", async () => {
    db.cancelLocation.mockResolvedValue(null);
    db.confirmLocation.mockResolvedValue(row());

    expect(await cancelEntry(ID, NOW)).toBeNull();
    expect(await confirmEntry(ID, NOW)).toEqual(row());
    expect(db.cancelLocation).toHaveBeenCalledWith(ID, NOW.toISOString());
    expect(db.confirmLocation).toHaveBeenCalledWith(ID, NOW.toISOString());
  });
});

describe("listAdminEntries", () => {
  const truck = (id: string, name: string, is_active = true) => ({ id, name, is_active }) as Truck;

  it("reads from the start of Stockholm's today for 14 days, with each truck's name", async () => {
    const inactive = "66666666-6666-4666-8666-666666666666";
    db.findLocationsOverlapping.mockResolvedValue([row(), row({ id: "7", truck_id: inactive })]);
    db.listAllTrucks.mockResolvedValue([truck(TRUCK, "Alpha"), truck(inactive, "Bortlagd", false)]);

    const entries = await listAdminEntries(NOW);

    // 2026-08-22 00:00 CEST to 2026-09-05 00:00 CEST.
    expect(db.findLocationsOverlapping).toHaveBeenCalledWith("2026-08-21T22:00:00.000Z", "2026-09-04T22:00:00.000Z");
    expect(entries.map((entry) => entry.truck_name)).toEqual(["Alpha", "Bortlagd"]);
  });

  it("starts at Stockholm's midnight, not UTC's, late in the evening", async () => {
    db.findLocationsOverlapping.mockResolvedValue([]);
    db.listAllTrucks.mockResolvedValue([]);

    // 00:30 on 2026-11-09 in Stockholm (CET).
    await listAdminEntries(new Date("2026-11-08T23:30:00.000Z"));

    expect(db.findLocationsOverlapping).toHaveBeenCalledWith("2026-11-08T23:00:00.000Z", "2026-11-22T23:00:00.000Z");
  });
});

describe("getRecentPlaces", () => {
  // An entry 16:00–20:00 Stockholm on 2026-08-<day>, at a place.
  const times = (day: number) => ({
    starts_at: `2026-08-${day}T14:00:00+00:00`,
    ends_at: `2026-08-${day}T18:00:00+00:00`,
  });
  const place = (latitude: number, longitude: number, label: string | null, day: number) => ({
    latitude,
    longitude,
    label,
    ...times(day),
  });
  const at = (...args: Parameters<typeof place>) => row(place(...args));

  it("reads the truck's last entries before now and keeps each place once, newest first", async () => {
    db.listRecentLocationsForTruck.mockResolvedValue([
      at(57.70, 11.95, "Järntorget", 21),
      at(57.71, 11.96, null, 20),
      at(57.70, 11.95, "Järntorget", 19),
      // The same pin under another name, and the same name at another pin, are other places.
      at(57.70, 11.95, "Torget", 18),
      at(57.72, 11.95, "Järntorget", 17),
      at(57.71, 11.96, null, 16),
    ]);

    // Each with its newest entry's times (plan #23, #35).
    expect(await getRecentPlaces(TRUCK, NOW)).toEqual([
      place(57.70, 11.95, "Järntorget", 21),
      place(57.71, 11.96, null, 20),
      place(57.70, 11.95, "Torget", 18),
      place(57.72, 11.95, "Järntorget", 17),
    ]);
    expect(db.listRecentLocationsForTruck).toHaveBeenCalledWith(TRUCK, NOW.toISOString(), RECENT_ENTRIES);
  });

  it(`offers at most ${RECENT_PLACES}`, async () => {
    db.listRecentLocationsForTruck.mockResolvedValue(
      Array.from({ length: RECENT_PLACES + 2 }, (_, i) => at(57.7, 11.9 + i / 100, `Plats ${i}`, 21 - i)),
    );

    const places = await getRecentPlaces(TRUCK, NOW);

    expect(places.map((entry) => entry.label)).toEqual(
      Array.from({ length: RECENT_PLACES }, (_, i) => `Plats ${i}`),
    );
  });
});
