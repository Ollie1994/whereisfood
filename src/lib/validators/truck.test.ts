import { describe, expect, it } from "vitest";
import { TRUCK_ERRORS, parseNewTruck, parseTruckPatch } from "@/lib/validators/truck";

const BODY = { name: "Burgarbilen", instagram_handle: "burgarbilen_gbg", cuisine_type: "Burgare", description: "Smash burgers" };

describe("parseNewTruck", () => {
  it("takes a full body, active unless it says otherwise", () => {
    expect(parseNewTruck(BODY)).toEqual({ ok: true, value: { ...BODY, is_active: true } });
    expect(parseNewTruck({ ...BODY, is_active: false })).toMatchObject({ value: { is_active: false } });
  });

  it("takes a name alone, the rest as none", () => {
    expect(parseNewTruck({ name: "  Tacobilen " })).toEqual({
      ok: true,
      value: { name: "Tacobilen", instagram_handle: null, cuisine_type: null, description: null, is_active: true },
    });
  });

  it("drops keys a client may not set", () => {
    const parsed = parseNewTruck({ ...BODY, id: "11111111-1111-1111-1111-111111111111", created_at: "2026-01-01T00:00:00Z" });
    expect(parsed.ok && Object.keys(parsed.value).sort()).toEqual([
      "cuisine_type",
      "description",
      "instagram_handle",
      "is_active",
      "name",
    ]);
  });

  // #29: one stored form, so one account can't be two trucks.
  it.each([
    ["as typed", "streetfoodgbg"],
    ["with a leading @", "@streetfoodgbg"],
    ["in capitals", "StreetFoodGBG"],
    ["with surrounding spaces", "  streetfoodgbg  "],
    ["all at once", " @StreetFoodGBG "],
  ])("stores a handle %s as streetfoodgbg", (_, typed) => {
    expect(parseNewTruck({ ...BODY, instagram_handle: typed })).toMatchObject({
      value: { instagram_handle: "streetfoodgbg" },
    });
  });

  // #29: so a second truck with no handle isn't a false duplicate.
  it.each([
    ["empty", ""],
    ["blank", "   "],
    ["an @ alone", "@"],
    ["null", null],
  ])("stores an %s handle as none", (_, typed) => {
    expect(parseNewTruck({ ...BODY, instagram_handle: typed })).toMatchObject({ value: { instagram_handle: null } });
  });

  it.each([
    ["a space after the @", "@ foo"],
    ["a space inside", "foo bar"],
    ["31 characters", "a".repeat(31)],
    ["a character outside the set", "foo-bar"],
    ["a second @", "@@foo"],
    ["a number", 42],
  ])("refuses a handle with %s", (_, typed) => {
    expect(parseNewTruck({ ...BODY, instagram_handle: typed })).toEqual({ ok: false, error: TRUCK_ERRORS.handle });
  });

  it("takes 30 characters, the cap", () => {
    expect(parseNewTruck({ ...BODY, instagram_handle: "a".repeat(30) }).ok).toBe(true);
  });

  it.each([
    ["no body", null, TRUCK_ERRORS.body],
    ["an array", [], TRUCK_ERRORS.body],
    ["no name", { instagram_handle: "foo" }, TRUCK_ERRORS.name],
    ["a blank name", { ...BODY, name: "   " }, TRUCK_ERRORS.name],
    ["a number for the cuisine", { ...BODY, cuisine_type: 3 }, TRUCK_ERRORS.cuisine],
    ["a number for the description", { ...BODY, description: 3 }, TRUCK_ERRORS.description],
    ["a string for is_active", { ...BODY, is_active: "false" }, TRUCK_ERRORS.active],
  ])("refuses %s", (_, body, error) => {
    expect(parseNewTruck(body)).toEqual({ ok: false, error });
  });

  it("stores a blank cuisine or description as none", () => {
    expect(parseNewTruck({ ...BODY, cuisine_type: " ", description: "" })).toMatchObject({
      value: { cuisine_type: null, description: null },
    });
  });
});

describe("parseTruckPatch", () => {
  it("keeps only the keys it holds, each checked alone", () => {
    expect(parseTruckPatch({ is_active: false })).toEqual({ ok: true, value: { is_active: false } });
    expect(parseTruckPatch({ instagram_handle: "@Foo" })).toEqual({ ok: true, value: { instagram_handle: "foo" } });
    expect(parseTruckPatch({ name: " Ny " , description: null })).toEqual({
      ok: true,
      value: { name: "Ny", description: null },
    });
  });

  it("clears a handle with a blank one", () => {
    expect(parseTruckPatch({ instagram_handle: "  " })).toEqual({ ok: true, value: { instagram_handle: null } });
  });

  it.each([
    ["no known key", { id: "x", created_at: "y" }, TRUCK_ERRORS.emptyPatch],
    ["an empty body", {}, TRUCK_ERRORS.emptyPatch],
    ["a blank name", { name: " " }, TRUCK_ERRORS.name],
    ["a null name", { name: null }, TRUCK_ERRORS.name],
    ["a bad handle", { instagram_handle: "foo bar" }, TRUCK_ERRORS.handle],
    ["a null is_active", { is_active: null }, TRUCK_ERRORS.active],
    ["no body", "x", TRUCK_ERRORS.body],
  ])("refuses %s", (_, body, error) => {
    expect(parseTruckPatch(body)).toEqual({ ok: false, error });
  });
});
