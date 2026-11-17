import { describe, expect, it } from "vitest";
import {
  MAX_CUISINE,
  MAX_DESCRIPTION,
  MAX_NAME,
  TRUCK_ERRORS,
  parseNewTruck,
  parseTruckPatch,
} from "@/lib/validators/truck";

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

// Phase 9 plan step 3 (IS #379): each free-text field at its maximum and one over, on
// create and on patch.
describe.each([
  ["name", MAX_NAME, TRUCK_ERRORS.nameLength],
  ["cuisine_type", MAX_CUISINE, TRUCK_ERRORS.cuisineLength],
  ["description", MAX_DESCRIPTION, TRUCK_ERRORS.descriptionLength],
] as const)("%s's length", (key, max, error) => {
  it(`takes ${max} characters on create and patch`, () => {
    const text = "a".repeat(max);
    expect(parseNewTruck({ ...BODY, [key]: text })).toMatchObject({ ok: true, value: { [key]: text } });
    expect(parseTruckPatch({ [key]: text })).toEqual({ ok: true, value: { [key]: text } });
  });

  it(`refuses ${max + 1} characters on create and patch`, () => {
    const text = "a".repeat(max + 1);
    expect(parseNewTruck({ ...BODY, [key]: text })).toEqual({ ok: false, error });
    expect(parseTruckPatch({ [key]: text })).toEqual({ ok: false, error });
  });

  // `tooLong` counts code points: the maximum in burgers is twice that in UTF-16 units.
  it("counts an emoji as one character on create and patch", () => {
    const text = "🍔".repeat(max);
    expect(parseNewTruck({ ...BODY, [key]: text })).toMatchObject({ ok: true, value: { [key]: text } });
    expect(parseTruckPatch({ [key]: text })).toEqual({ ok: true, value: { [key]: text } });
    expect(parseNewTruck({ ...BODY, [key]: `${text}🍔` })).toEqual({ ok: false, error });
    expect(parseTruckPatch({ [key]: `${text}🍔` })).toEqual({ ok: false, error });
  });

  // Mixed: `max` characters in `max + 1` units, past `tooLong`'s first shortcut, so the
  // count itself decides at the maximum; one more letter is over.
  it("takes letters and an emoji at the maximum on create and patch, refusing one more", () => {
    const text = `${"a".repeat(max - 1)}🍔`;
    expect(parseNewTruck({ ...BODY, [key]: text })).toMatchObject({ ok: true, value: { [key]: text } });
    expect(parseTruckPatch({ [key]: text })).toEqual({ ok: true, value: { [key]: text } });
    expect(parseNewTruck({ ...BODY, [key]: `a${text}` })).toEqual({ ok: false, error });
    expect(parseTruckPatch({ [key]: `a${text}` })).toEqual({ ok: false, error });
  });

  // The stored text is the trimmed one.
  it("doesn't count the spaces trimmed off, on create and patch", () => {
    const text = "a".repeat(max);
    expect(parseNewTruck({ ...BODY, [key]: `  ${text}  ` })).toMatchObject({ ok: true, value: { [key]: text } });
    expect(parseTruckPatch({ [key]: `  ${text}  ` })).toEqual({ ok: true, value: { [key]: text } });
  });
});

// IS #400: a character the database refuses (`unstorable`) is refused here, the name with
// "Ogiltigt namn" (PR #402) and the others with their own message, on create and patch; an
// emoji (a surrogate pair) and U+0001 aren't.
describe.each([
  ["name", TRUCK_ERRORS.nameInvalid],
  ["cuisine_type", TRUCK_ERRORS.cuisine],
  ["description", TRUCK_ERRORS.description],
] as const)("%s's characters", (key, error) => {
  it.each([
    ["a NUL", "a\u0000b"],
    ["a lone high surrogate", "a\ud800b"],
    ["a lone low surrogate", "a\udc00b"],
  ])("refuses %s on create and patch", (_, text) => {
    expect(parseNewTruck({ ...BODY, [key]: text })).toEqual({ ok: false, error });
    expect(parseTruckPatch({ [key]: text })).toEqual({ ok: false, error });
  });

  it.each([
    ["an emoji", "Taco 🌮"],
    ["U+0001", "a\u0001b"],
  ])("takes %s on create and patch", (_, text) => {
    expect(parseNewTruck({ ...BODY, [key]: text })).toMatchObject({ ok: true, value: { [key]: text } });
    expect(parseTruckPatch({ [key]: text })).toEqual({ ok: true, value: { [key]: text } });
  });
});
