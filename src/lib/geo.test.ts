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
    // Catches a fat-fingered ordinate (157.85) or a sign error (-57.5), NOT a
    // transposed box: Gothenburg's latitude range is a subset of the valid
    // longitude range and vice versa, so a fully transposed box satisfies every
    // assertion here. Transposition is caught by the REAL_SPOTS cases below —
    // a transposed box rejects Järntorget — and that is the only thing that
    // catches it. Said explicitly because the first version of this comment
    // claimed the coverage lived here, which would have left the real gate
    // looking redundant to whoever refactored next.
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

  describe("non-numeric ordinates", () => {
    // The type signature says `number`, but the guard's job starts where the type
    // system stops: `res.json()` is `any`, and Nominatim returns lat/lon as JSON
    // STRINGS, so a consumer that forgets to convert type-checks fine. Relational
    // coercion then makes `"57.6997" >= 57.5` true, and a string coordinate would
    // be waved through into `locations.latitude`.
    //
    // Cast through `unknown` deliberately — this is exactly the unsound call the
    // guard exists to catch, so the test has to be able to make it.
    const loose = isInGothenburg as unknown as (lat: unknown, lng: unknown) => boolean;

    it("rejects Nominatim's string coordinates even though they coerce in range", () => {
      expect(loose("57.6997", "11.9515")).toBe(false);
      // Proof the strings really are in-range once converted — the rejection is
      // the guard firing, not the coordinates being wrong.
      expect(isInGothenburg(Number("57.6997"), Number("11.9515"))).toBe(true);
    });

    it.each([
      ["null", null, null],
      ["undefined", undefined, undefined],
      ["empty string", "", ""],
      ["a numeric string latitude only", "57.6997", 11.9515],
      ["an object", { lat: 57.6997 }, { lng: 11.9515 }],
      ["an array", [57.6997], [11.9515]],
    ])("rejects %s", (_label, lat, lng) => {
      expect(loose(lat, lng)).toBe(false);
    });
  });
});

describe("geo.ts purity", () => {
  // Verified by test, not by inspection (the plan's rule): the module is consumed
  // by a pure parser test AND by an impure geocoding path, so it must be safe for
  // the stricter of the two.
  //
  // Comment lines are dropped before matching, because geo.ts carries long prose
  // explaining *why* it has no imports and makes no network calls — a substring
  // search over the raw file would eventually trip on its own documentation.
  //
  // Only lines that BEGIN with a comment marker are dropped, which is deliberately
  // cruder than a real stripper. A regex stripper is string-literal-unaware: a
  // `/*` inside a string swallows everything to the next `*/`, and it will happily
  // eat a real `import { supabaseAdmin }` sitting between them, leaving the test
  // green and guarding nothing (verified). Dropping whole comment lines cannot
  // remove code, so the failure direction is inverted — a trailing comment
  // containing the word "import" trips the test, which is a loud false positive
  // rather than a silent false negative. geo.ts's comments are all full-line.
  function geoSourceCode(): string {
    return readFileSync(fileURLToPath(new URL("./geo.ts", import.meta.url)), "utf8")
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
      .join("\n");
  }

  it("imports nothing at all — static, dynamic, type-only or CJS", () => {
    // Zero imports is the strongest form of the guarantee and needs no brittle
    // allowlist. The bare `\bimport\b` is deliberate and covers every syntactic
    // form: `import{x}from"y"` with no space, and `await import("@/lib/db")`,
    // which a line-anchored pattern misses entirely — and a dynamic db import is
    // exactly the impurity this test exists to prevent.
    //
    // It also rejects `import type`, which is erased at compile time and would
    // be harmless. That is intended, not an oversight: this module needs nothing,
    // so anything arriving here deserves a deliberate decision rather than a
    // silent pass. Relaxing it is one line, if a real need ever appears.
    expect(geoSourceCode()).not.toMatch(/\bimport\b/);
    expect(geoSourceCode()).not.toMatch(/\brequire\s*\(/);
  });

  it("never reaches the network", () => {
    // The module header promises "no HTTP", and `fetch` is a global that needs
    // no import — so the import assertion above does not imply this one. Same
    // reasoning that earned the clock its own test; it was simply not applied
    // here until review caught the asymmetry.
    expect(geoSourceCode()).not.toMatch(/\bfetch\s*\(/);
  });

  it("never reads the clock", () => {
    expect(geoSourceCode()).not.toMatch(/new Date\(|Date\.now\(/);
  });
});
