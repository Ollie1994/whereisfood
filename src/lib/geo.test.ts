import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GOTHENBURG_BBOX, isInGothenburg } from "@/lib/geo";

// Real coordinates for spots the dictionary will seed (#4). If the box is ever
// retuned, these are the cases that must keep passing — they are the reason it
// exists, not arbitrary fixtures.
const REAL_SPOTS: ReadonlyArray<[name: string, lat: number, lng: number]> = [
  ["Järntorget", 57.6997, 11.9515],
  ["Lindholmen", 57.7075, 11.9386],
  ["Chalmers Johanneberg", 57.6889, 11.9787],
  ["Brunnsparken", 57.7075, 11.9675],
  ["Mölndal centrum", 57.6554, 12.0134],
];

describe("GOTHENBURG_BBOX", () => {
  it("is a well-formed box — south below north, west below east", () => {
    expect(GOTHENBURG_BBOX.south).toBeLessThan(GOTHENBURG_BBOX.north);
    expect(GOTHENBURG_BBOX.west).toBeLessThan(GOTHENBURG_BBOX.east);
  });

  it("holds latitudes and longitudes in their valid global ranges", () => {
    // Guards against the box itself being written transposed — the same mistake
    // it exists to catch in its consumers.
    expect(GOTHENBURG_BBOX.south).toBeGreaterThanOrEqual(-90);
    expect(GOTHENBURG_BBOX.north).toBeLessThanOrEqual(90);
    expect(GOTHENBURG_BBOX.west).toBeGreaterThanOrEqual(-180);
    expect(GOTHENBURG_BBOX.east).toBeLessThanOrEqual(180);
  });
});

describe("isInGothenburg", () => {
  it.each(REAL_SPOTS)("accepts %s", (_name, lat, lng) => {
    expect(isInGothenburg(lat, lng)).toBe(true);
  });

  it("rejects a transposed (lng, lat) pair", () => {
    // The whole point of the box: 11.95 is not a plausible Swedish latitude, so
    // swapping the arguments must fail loudly rather than pin a truck at sea.
    expect(isInGothenburg(57.6997, 11.9515)).toBe(true);
    expect(isInGothenburg(11.9515, 57.6997)).toBe(false);
  });

  it("rejects coordinates elsewhere in Sweden", () => {
    expect(isInGothenburg(59.3293, 18.0686)).toBe(false); // Stockholm
    expect(isInGothenburg(55.6050, 13.0038)).toBe(false); // Malmö
  });

  it("rejects null island", () => {
    // (0, 0) is what a missing-coordinate bug looks like once it has been coerced
    // to numbers — worth pinning explicitly.
    expect(isInGothenburg(0, 0)).toBe(false);
  });

  describe("boundaries are inclusive", () => {
    const { west, south, east, north } = GOTHENBURG_BBOX;
    const midLat = (south + north) / 2;
    const midLng = (west + east) / 2;

    // Documented semantics, asserted rather than left to a `<` vs `<=` accident.
    it.each([
      ["south edge", south, midLng],
      ["north edge", north, midLng],
      ["west edge", midLat, west],
      ["east edge", midLat, east],
      ["south-west corner", south, west],
      ["north-east corner", north, east],
      ["south-east corner", south, east],
      ["north-west corner", north, west],
    ])("accepts a point exactly on the %s", (_label, lat, lng) => {
      expect(isInGothenburg(lat, lng)).toBe(true);
    });

    it.each([
      ["just south of south", south - 0.0001, midLng],
      ["just north of north", north + 0.0001, midLng],
      ["just west of west", midLat, west - 0.0001],
      ["just east of east", midLat, east + 0.0001],
    ])("rejects a point %s", (_label, lat, lng) => {
      expect(isInGothenburg(lat, lng)).toBe(false);
    });
  });

  describe("non-finite ordinates", () => {
    // Falls out of the comparisons rather than being special-cased; pinned here
    // so the behaviour is deliberate and survives a refactor of the predicate.
    it.each([
      ["NaN latitude", NaN, 11.9515],
      ["NaN longitude", 57.6997, NaN],
      ["both NaN", NaN, NaN],
      ["Infinity latitude", Infinity, 11.9515],
      ["-Infinity longitude", 57.6997, -Infinity],
    ])("rejects %s", (_label, lat, lng) => {
      expect(isInGothenburg(lat, lng)).toBe(false);
    });
  });
});

describe("geo.ts purity", () => {
  it("imports nothing at all — no db, no supabase, no node builtins", () => {
    // Verified by reading the source, not by inspection (the plan's rule): the
    // module is consumed by a pure parser test AND by an impure geocoding path,
    // so it must be safe for the stricter of the two. It currently has zero
    // imports, which is the strongest form of that guarantee and the easiest to
    // assert without a brittle allowlist.
    const source = readFileSync(
      fileURLToPath(new URL("./geo.ts", import.meta.url)),
      "utf8",
    );
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/\brequire\s*\(/);
  });

  it("never reads the clock", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./geo.ts", import.meta.url)),
      "utf8",
    );
    expect(source).not.toMatch(/new Date\(|Date\.now\(/);
  });
});
