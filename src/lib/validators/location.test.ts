import { describe, expect, it } from "vitest";
import { LOCATION_ERRORS, parseLocationPatch, parseNewLocation } from "@/lib/validators/location";

// Järntorget, inside the Gothenburg box (`src/lib/geo.ts`).
const LAT = 57.6997;
const LNG = 11.953;
const TRUCK = "11111111-1111-1111-1111-111111111111";

const BODY = {
  truck_id: TRUCK,
  latitude: LAT,
  longitude: LNG,
  label: "Järntorget",
  starts_at: "2026-11-09T11:00:00+01:00",
  ends_at: "2026-11-09T13:00:00+01:00",
};

const refused = (error: string) => ({ ok: false, error });

describe("parseNewLocation", () => {
  it("accepts a whole entry, with its times in UTC", () => {
    expect(parseNewLocation(BODY)).toEqual({
      ok: true,
      value: {
        truck_id: TRUCK,
        latitude: LAT,
        longitude: LNG,
        label: "Järntorget",
        starts_at: "2026-11-09T10:00:00.000Z",
        ends_at: "2026-11-09T12:00:00.000Z",
      },
    });
  });

  // #17: the server sets these. Other unknown keys are dropped too, `id` here.
  it("never reads created_by, source, cancelled_at or other keys", () => {
    const result = parseNewLocation({
      ...BODY,
      created_by: "00000000-0000-4000-8000-000000000001",
      source: "owner",
      cancelled_at: "2026-11-09T09:00:00Z",
      id: "00000000-0000-4000-8000-000000000002",
    });
    expect(result.ok).toBe(true);
    const value = result.ok ? result.value : {};
    expect(Object.keys(value).sort()).toEqual(["ends_at", "label", "latitude", "longitude", "starts_at", "truck_id"]);
  });

  it.each([null, [], "x", 1, true])("refuses a body that isn't an object: %j", (body) => {
    expect(parseNewLocation(body)).toEqual(refused(LOCATION_ERRORS.body));
  });

  // A malformed id would reach Postgres as `22P02`.
  it.each([undefined, 1, "", "not-a-uuid", `${TRUCK}x`, ` ${TRUCK}`])("refuses truck_id %j", (truckId) => {
    expect(parseNewLocation({ ...BODY, truck_id: truckId })).toEqual(refused(LOCATION_ERRORS.truck));
  });

  it("refuses a transposed pair as outside Gothenburg", () => {
    expect(parseNewLocation({ ...BODY, latitude: LNG, longitude: LAT })).toEqual(refused(LOCATION_ERRORS.outside));
  });

  it.each([
    ["Stockholm", 59.3293, 18.0686],
    ["null island", 0, 0],
  ])("refuses %s as outside Gothenburg", (_, latitude, longitude) => {
    expect(parseNewLocation({ ...BODY, latitude, longitude })).toEqual(refused(LOCATION_ERRORS.outside));
  });

  it.each([
    ["a string latitude", { latitude: String(LAT) }],
    ["a string longitude", { longitude: String(LNG) }],
    ["a null latitude", { latitude: null }],
    ["no longitude", { longitude: undefined }],
  ])("refuses %s", (_, change) => {
    expect(parseNewLocation({ ...BODY, ...change })).toEqual(refused(LOCATION_ERRORS.position));
  });

  it.each([
    [undefined, null],
    [null, null],
    ["   ", null],
    ["  Järntorget ", "Järntorget"],
  ])("reads label %j as %j", (label, expected) => {
    const result = parseNewLocation({ ...BODY, label });
    expect(result.ok && result.value.label).toBe(expected);
  });

  it.each([1, true, {}])("refuses label %j", (label) => {
    expect(parseNewLocation({ ...BODY, label })).toEqual(refused(LOCATION_ERRORS.label));
  });

  // With no offset a time would be read in the server's own zone.
  it.each([
    undefined,
    null,
    1762682400000,
    "2026-11-09T11:00:00",
    "2026-11-09",
    "2026-11-09T24:00:00+01:00",
    "not a time",
    // UTC years outside 0001–9999, whose `toISOString` forms Postgres refused (PR #238).
    "0000-11-09T11:00:00Z",
    "0001-01-01T00:30:00+01:00",
    "9999-12-31T23:30:00-01:00",
  ])("refuses starts_at %j, and the same as ends_at", (time) => {
    expect(parseNewLocation({ ...BODY, starts_at: time })).toEqual(refused(LOCATION_ERRORS.startsAt));
    expect(parseNewLocation({ ...BODY, ends_at: time })).toEqual(refused(LOCATION_ERRORS.endsAt));
    if (time !== undefined) {
      expect(parseLocationPatch({ starts_at: time })).toEqual(refused(LOCATION_ERRORS.startsAt));
      expect(parseLocationPatch({ ends_at: time })).toEqual(refused(LOCATION_ERRORS.endsAt));
    }
  });

  // The four-digit years `toISOString` writes, not a sensible range (`location.ts`,
  // `timestamp`'s limit).
  it("accepts the first and last instants of UTC years 0001 and 9999, the year bound's edges", () => {
    const result = parseNewLocation({ ...BODY, starts_at: "0001-01-01T00:00:00Z", ends_at: "9999-12-31T23:59:59.999Z" });
    expect(result.ok && [result.value.starts_at, result.value.ends_at]).toEqual([
      "0001-01-01T00:00:00.000Z",
      "9999-12-31T23:59:59.999Z",
    ]);
  });

  it.each([
    ["an end equal to the start", "2026-11-09T11:00:00+01:00"],
    ["an end before the start", "2026-11-09T10:59:59+01:00"],
    ["the same instant in another offset", "2026-11-09T10:00:00Z"],
  ])("refuses %s", (_, endsAt) => {
    expect(parseNewLocation({ ...BODY, ends_at: endsAt })).toEqual(refused(LOCATION_ERRORS.order));
  });

  it("accepts an end one millisecond after the start, across offsets", () => {
    const result = parseNewLocation({ ...BODY, ends_at: "2026-11-09T10:00:00.001Z" });
    expect(result.ok).toBe(true);
  });
});

describe("parseLocationPatch", () => {
  it("accepts each key alone", () => {
    expect(parseLocationPatch({ latitude: LAT })).toEqual({ ok: true, value: { latitude: LAT } });
    expect(parseLocationPatch({ longitude: LNG })).toEqual({ ok: true, value: { longitude: LNG } });
    expect(parseLocationPatch({ label: " Kungstorget " })).toEqual({ ok: true, value: { label: "Kungstorget" } });
    expect(parseLocationPatch({ starts_at: "2026-11-09T11:00:00+01:00" })).toEqual({
      ok: true,
      value: { starts_at: "2026-11-09T10:00:00.000Z" },
    });
    expect(parseLocationPatch({ ends_at: "2026-11-09T13:00:00+01:00" })).toEqual({
      ok: true,
      value: { ends_at: "2026-11-09T12:00:00.000Z" },
    });
  });

  it("reads a null label as clearing it", () => {
    expect(parseLocationPatch({ label: null })).toEqual({ ok: true, value: { label: null } });
  });

  // Across fields is `editEntry`'s, on the merged row (#226).
  it("leaves the box and the time order to the service", () => {
    expect(parseLocationPatch({ latitude: LNG })).toEqual({ ok: true, value: { latitude: LNG } });
    expect(
      parseLocationPatch({ starts_at: "2026-11-09T13:00:00Z", ends_at: "2026-11-09T11:00:00Z" }).ok,
    ).toBe(true);
  });

  it("drops created_by, source, cancelled_at, truck_id and other keys", () => {
    expect(
      parseLocationPatch({
        label: "Kungstorget",
        created_by: null,
        source: "owner",
        cancelled_at: "2026-11-09T09:00:00Z",
        truck_id: TRUCK,
        id: TRUCK,
      }),
    ).toEqual({ ok: true, value: { label: "Kungstorget" } });
  });

  // The db layer throws on an empty patch.
  it.each([
    {},
    { cancelled_at: "2026-11-09T09:00:00Z" },
    { created_by: null, source: "owner" },
    { truck_id: TRUCK },
  ])("refuses %j, which holds no key it may change", (body) => {
    expect(parseLocationPatch(body)).toEqual(refused(LOCATION_ERRORS.emptyPatch));
  });

  it.each([null, [], "x"])("refuses a body that isn't an object: %j", (body) => {
    expect(parseLocationPatch(body)).toEqual(refused(LOCATION_ERRORS.body));
  });

  it.each([
    [{ latitude: "57.7" }, LOCATION_ERRORS.position],
    [{ longitude: null }, LOCATION_ERRORS.position],
    [{ label: 3 }, LOCATION_ERRORS.label],
    [{ starts_at: "2026-11-09T11:00:00" }, LOCATION_ERRORS.startsAt],
    [{ ends_at: null }, LOCATION_ERRORS.endsAt],
    [{ label: "ok", latitude: "57.7" }, LOCATION_ERRORS.position],
  ])("refuses %j", (body, error) => {
    expect(parseLocationPatch(body)).toEqual(refused(error));
  });
});

describe("LOCATION_ERRORS", () => {
  it("are distinct, so a test can tell which check refused", () => {
    const messages = Object.values(LOCATION_ERRORS);
    expect(new Set(messages).size).toBe(messages.length);
  });
});
