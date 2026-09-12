import { describe, expect, it } from "vitest";
import { type ConfidenceInput, scoreConfidence } from "./confidence";
import { sourceConfidence } from "@/lib/sources";
import type { TimeKind } from "./time";

// Purity is NOT asserted here — `purity.test.ts` globs this directory and already
// covers `confidence.ts`. See the same note in `location.test.ts`.

const score = (input: Partial<ConfidenceInput> = {}) =>
  scoreConfidence({ location: null, time: null, isNegation: false, ...input });

// ⚠ THE TABLE IS THE SPEC, and it is the thing required to be exhaustive.
//
// An earlier version of this file declared `LOCATIONS` and `TIMES` beside the union
// with `as const satisfies readonly T[]` and a comment claiming they were "projected
// from the union". **They were not.** `satisfies` is a SUBSET check: it catches a typo
// and does not catch an omission, which is the failure that matters. Verified — adding
// a `"cached"` location, or an `"allday"` TimeKind scored 0.9 (above `lunchtid`,
// inverting the ordering this file claims to enforce), left `tsc` clean and all 48
// tests green.
//
// That is the identical omission PR #88 closed two commits earlier, and this file
// carried a comment citing that very lesson while reproducing it. The machinery below
// is #88's, used the way #88 concluded it should be: anchored to the EXPECTATION
// TABLE, not to a list sitting next to it.
const MATRIX = [
  // Dictionary hit — the documented matrix.
  ["dictionary", "range", 1.0],
  ["dictionary", "lunchtid", 0.85],
  ["dictionary", "start", 0.7],
  ["dictionary", null, 0.6],
  // Geocode fallback — one notch lower at every row (plan decision #3).
  ["fallback", "range", 0.85],
  ["fallback", "lunchtid", 0.7],
  ["fallback", "start", 0.55],
  ["fallback", null, 0.45],
  // No location at all. The fallback penalty has nothing to apply to.
  [null, "range", 0.2],
  [null, "lunchtid", 0.2],
  [null, "start", 0.2],
  [null, null, 0.0],
] as const satisfies readonly (readonly [ConfidenceInput["location"], TimeKind | null, number])[];

// `AssertCovered<T>` rather than the conditional spelling, because the error message
// is the point: constraining reports `Type '"cached"' does not satisfy the constraint
// 'never'` and names the missing member, where a conditional reports "Type 'true' is
// not assignable to type 'never'" and leaves you diffing by eye. Bound to a `void`-ed
// const so an unused type alias is not an unused-vars warning. All of this is #88's —
// see `sources.test.ts` for the full reasoning rather than a second copy of it.
type AssertCovered<T extends never> = T;
const _locationsCovered: AssertCovered<
  Exclude<ConfidenceInput["location"], (typeof MATRIX)[number][0]>
>[] = [];
const _timesCovered: AssertCovered<
  Exclude<ConfidenceInput["time"], (typeof MATRIX)[number][1]>
>[] = [];
void _locationsCovered;
void _timesCovered;

// Projected from the table, so they cannot drift from it.
const LOCATIONS = [...new Set(MATRIX.map(([location]) => location))];
const TIMES = [...new Set(MATRIX.map(([, time]) => time))];

describe("scoreConfidence", () => {
  it.each(MATRIX)("location=%s time=%s → %s", (location, time, expected) => {
    expect(score({ location, time })).toBe(expected);
  });

  it("names every pair exactly once", () => {
    // `AssertCovered` above proves every union MEMBER appears somewhere in the table;
    // it says nothing about the pairs. This closes the other half — the full cross
    // product, each row once — and doubles as the non-vacuity assertion, since
    // `it.each([])` registers zero tests and reports green (process-log row 43).
    const pairs = MATRIX.map(([location, time]) => `${location}/${time}`);
    const required = LOCATIONS.flatMap((location) => TIMES.map((time) => `${location}/${time}`));

    expect(new Set(pairs).size).toBe(pairs.length);
    expect(pairs.length).toBe(required.length);
    expect(required.filter((pair) => !pairs.includes(pair))).toEqual([]);
  });

  describe("the six rows project-context.md documents", () => {
    // Named against the document's own wording, so a reader comparing the two does
    // not have to infer which table row is which sentence.
    // Expected value SECOND, so the printf-style title prints the row name and the
    // score. With the input object in that slot the title rendered the object and the
    // block could not be read against the document it exists to mirror.
    it.each([
      ["location + explicit time range", 1.0, { location: "dictionary", time: "range" }],
      ["location + lunchtid", 0.85, { location: "dictionary", time: "lunchtid" }],
      ["location only (no time)", 0.6, { location: "dictionary", time: null }],
      ["time only (no location)", 0.2, { location: null, time: "range" }],
      ["negation detected", 0.0, { location: "dictionary", time: "range", isNegation: true }],
      ["nothing extracted", 0.0, { location: null, time: null }],
    ] as const)("%s → %s", (_row, expected, input) => {
      expect(score(input)).toBe(expected);
    });

    it("KNOWN GAP: `start` is a seventh row the document does not have", () => {
      // `TimeKind` gained `start` in #58, after that matrix was written. Asserted so
      // the gap is a tracked fact rather than something a future reader finds by
      // diffing a doc against code and resolves by guessing. #73 reconciles it.
      expect(score({ location: "dictionary", time: "start" })).toBe(0.7);
    });
  });

  describe("the geocode-fallback penalty (#3)", () => {
    it.each([
      ["range", 1.0, 0.85],
      ["lunchtid", 0.85, 0.7],
      ["start", 0.7, 0.55],
      [null, 0.6, 0.45],
    ] as const)("time=%s drops %s → %s", (time, dictionary, fallback) => {
      // The same caption, resolved two ways. A hand-reviewed dictionary coordinate
      // and a fuzzy geocode are not equally trustworthy, and confidence is the
      // mechanism for saying so.
      expect(score({ location: "dictionary", time })).toBe(dictionary);
      expect(score({ location: "fallback", time })).toBe(fallback);
    });

    it("is one notch at every row, and the notch is the same size", () => {
      // Worth knowing, and deliberately NOT worth computing — see the next test.
      for (const time of TIMES) {
        const dropped = score({ location: "dictionary", time }) - score({ location: "fallback", time });
        expect(dropped).toBeCloseTo(0.15, 10);
      }
    });

    it("⚠ is a TABLE and not `base - 0.15`, because 0.6 - 0.15 < 0.45", () => {
      // The reason `confidence.ts` types both columns out. The ladder is exactly
      // −0.15 in decimal and is not in IEEE 754:
      expect(1.0 - 0.15).toBe(0.85);
      expect(0.85 - 0.15).toBe(0.7);
      expect(0.6 - 0.15).not.toBe(0.45); // 0.44999999999999996

      // Which matters because the display threshold is `>= 0.45` and plan decision #3
      // puts this row exactly ON it. Computed, every location-only fallback pin would
      // fall a hairsbreadth under and vanish from the map with no error anywhere.
      expect(0.6 - 0.15).toBeLessThan(0.45);
      expect(score({ location: "fallback", time: null })).toBeGreaterThanOrEqual(0.45);
    });

    it("⚠ and 0.45 does not survive float4 either — the same bug one layer down (#92)", () => {
      // `locations.confidence` is `float4` (migration 0001:70). float32 cannot
      // represent 0.45, so the value that goes in at exactly the threshold comes back
      // BELOW it:
      expect(Math.fround(0.45)).toBeLessThan(0.45); // 0.44999998807907104

      // Which means a server-side filter written the obvious way drops exactly the pin
      // plan decision #3 designed to sit on the line:
      //
      //   .gte("confidence", 0.45)   →  excludes a manual location-only fallback
      //
      // Nothing queries the column yet, so this is a hazard rather than a live defect —
      // but it is NOT safe by construction, and #64/#68 or the Phase 4 map query is
      // where it gets written. Pinned here, at the place the 0.45 decision is made,
      // rather than only in the query that would trip over it. Tracked as #92.
      const atThreshold = score({ location: "fallback", time: null });

      expect(atThreshold).toBe(0.45);
      expect(Math.fround(atThreshold)).toBeLessThan(0.45);

      // Every other reachable score clears the threshold with room to spare, so this
      // is a one-cell hazard rather than a general one — asserted so the scope of #92
      // is a checked claim.
      const narrowedAndAbove = MATRIX.map(([, , value]) => value)
        .filter((value) => value > 0.45)
        .every((value) => Math.fround(value) > 0.45);

      expect(narrowedAndAbove).toBe(true);
    });
  });

  // ⚠ THE ORDERING IS THE MEANING; the literals are one encoding of it. Every test
  // above pins a number, so a change that edits `confidence.ts` AND its matrix row
  // together passes them all while inverting what the matrix says. These assert the
  // relationships instead, and they are what would catch `start` being scored above
  // `lunchtid` — the one constraint `time.ts` states in prose and no literal enforces.
  describe("the ordering the numbers encode", () => {
    it.each(["dictionary", "fallback"] as const)(
      "more information scores higher, for a %s location",
      (location) => {
        // A stated window beats an inferred one beats an opening time beats no time.
        expect(score({ location, time: "range" })).toBeGreaterThan(score({ location, time: "lunchtid" }));
        expect(score({ location, time: "lunchtid" })).toBeGreaterThanOrEqual(score({ location, time: "start" }));
        expect(score({ location, time: "start" })).toBeGreaterThan(score({ location, time: null }));
      },
    );

    it("`start` never outranks `lunchtid` — time.ts states this and nothing else enforces it", () => {
      // `time.ts`: "the intended mapping is `range` 1.0, `lunchtid` 0.85, and `start`
      // no higher than `lunchtid`, since it carries strictly less information than
      // either." A marked start gives an opening with no close; lunchtid gives a
      // complete window. Scoring the lesser one higher would rank a half-stated
      // caption above a fully-inferred one.
      for (const location of ["dictionary", "fallback"] as const) {
        expect(score({ location, time: "start" })).toBeLessThanOrEqual(score({ location, time: "lunchtid" }));
      }
    });

    it("a dictionary hit always outranks the same caption geocoded", () => {
      for (const time of TIMES) {
        expect(score({ location: "dictionary", time })).toBeGreaterThan(score({ location: "fallback", time }));
      }
    });

    it("any resolved location outranks time-only, which outranks nothing", () => {
      const weakestLocation = Math.min(
        ...LOCATIONS.filter((location) => location !== null).flatMap((location) =>
          TIMES.map((time) => score({ location, time })),
        ),
      );

      expect(weakestLocation).toBeGreaterThan(score({ location: null, time: "range" }));
      expect(score({ location: null, time: "range" })).toBeGreaterThan(score({ location: null, time: null }));
    });
  });

  describe("a negation short-circuits everything", () => {
    it.each(
      LOCATIONS.flatMap((location) => TIMES.map((time) => [location, time] as const)),
    )("location=%s time=%s → 0.0", (location, time) => {
      // Over the whole input space, not one example: the guarantee is that NOTHING
      // else can lift it. A negation that scored on an incidentally-extracted
      // location would put a cancelled truck back on the map.
      expect(score({ location, time, isNegation: true })).toBe(0.0);
    });
  });

  describe("worked examples at the display threshold", () => {
    // ⚠ These multiply by the REAL `sourceConfidence` (#59) rather than by a literal.
    // The threshold argument in plan decision #3 is about the product, and a test
    // using a hand-typed 0.55 would keep passing if the lane constants changed —
    // which is exactly the drift `sources.ts` exists to prevent.
    it("an email post with a geocoded address and a range renders, just", () => {
      // #3's own sanity check: 0.85 × 0.55 = 0.4675, above the 0.45 line. The penalty
      // makes it look less certain without hiding it, which is the intended behaviour.
      const combined = score({ location: "fallback", time: "range" }) * sourceConfidence("email");

      expect(combined).toBeCloseTo(0.4675, 10);
      expect(combined).toBeGreaterThanOrEqual(0.45);
    });

    it("the same post without a time does not render", () => {
      const combined = score({ location: "fallback", time: null }) * sourceConfidence("email");

      expect(combined).toBeLessThan(0.45);
    });

    it("a webhook post with a dictionary hit and a range renders comfortably", () => {
      const combined = score({ location: "dictionary", time: "range" }) * sourceConfidence("webhook");

      expect(combined).toBeCloseTo(0.85, 10);
      expect(combined).toBeGreaterThanOrEqual(0.45);
    });

    it("a location-only fallback renders only from the manual lane", () => {
      // 0.45 is the weakest thing still worth showing, and only a lane trusted at 1.0
      // carries it over the line. Both halves asserted, since the interesting claim
      // is the boundary rather than either value.
      expect(score({ location: "fallback", time: null }) * sourceConfidence("manual")).toBeGreaterThanOrEqual(0.45);
      expect(score({ location: "fallback", time: null }) * sourceConfidence("webhook")).toBeLessThan(0.45);
    });
  });

  it("never returns a value outside 0.0–1.0", () => {
    const every = LOCATIONS.flatMap((location) =>
      TIMES.flatMap((time) =>
        [true, false].map((isNegation) => score({ location, time, isNegation })),
      ),
    );

    expect(every.length).toBe(LOCATIONS.length * TIMES.length * 2);
    for (const value of every) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});
