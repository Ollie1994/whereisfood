import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
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
    // Rejected explicitly by the `Number.isFinite` prefix in `isInGothenburg`.
    // These once fell out of the comparisons on their own, and an earlier version
    // of this comment still said so — which argued the guard was incidental and
    // would have invited its removal, reopening the string-coordinate hole the
    // same guard closes. The behaviour is identical either way; the point of
    // saying it correctly is that the prefix is load-bearing, not redundant.
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
  function geoSource(): string {
    return readFileSync(fileURLToPath(new URL("./geo.ts", import.meta.url)), "utf8");
  }

  it("imports nothing at all — every syntactic form, per the compiler's own scanner", () => {
    // WHY the compiler and not a regex. Three review rounds produced three
    // different holes in three hand-written matchers:
    //
    //   `/^\s*import\s/m`        missed `import{x}from"y"` and `await import(…)`
    //   `\bimport\b` + stripper  the stripper ate a real import between a `/*`
    //                            inside a string and the next `*/`
    //   line-anchored stripper   dropped `/* c */ import { supabaseAdmin } …`
    //                            whole, code and all
    //
    // Each fix closed the reported hole and opened another, because matching a
    // grammar with regexes does not converge — there is always one more form.
    // `ts.preProcessFile` is the scanner the compiler itself uses to answer
    // exactly this question, so the guard now inherits TypeScript's definition of
    // "an import" instead of competing with it. Verified to catch all eight forms
    // above plus `export {x} from`, `export * from`, `require()` and type-only
    // imports, while ignoring strings and comments that merely look like imports.
    //
    // Type-only imports are reported and therefore rejected. Intended: this module
    // needs nothing, so anything arriving deserves a deliberate decision rather
    // than a silent pass. Relaxing it is a filter on the returned list.
    const imported = ts
      .preProcessFile(geoSource(), /* readImportFiles */ true, /* detectJavaScriptImports */ true)
      .importedFiles.map((f) => f.fileName);

    expect(imported).toEqual([]);
  });

  // `fetch` and `Date` are GLOBALS — they need no import, so the scanner above
  // says nothing about them and these need their own assertions. Matched against
  // the raw source with no comment stripping: requiring the call parenthesis is
  // what keeps geo.ts's prose from tripping them, and if prose ever does trip one
  // the result is a visible failure rather than a guard that silently stopped
  // guarding. That is the direction to fail in, and it is why no stripper is worth
  // reintroducing here.
  it("never reaches the network", () => {
    expect(geoSource()).not.toMatch(/\bfetch\s*\(/);
  });

  it("never reads the clock", () => {
    expect(geoSource()).not.toMatch(/new Date\(|Date\.now\(/);
  });
});
