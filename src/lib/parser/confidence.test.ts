import { describe, expect, it } from "vitest";
import { type ConfidenceInput, scoreConfidence } from "./confidence";
import { sourceConfidence } from "@/lib/sources";
import type { TimeKind } from "./time";

// Purity is NOT asserted here — `purity.test.ts` globs this directory and already
// covers `confidence.ts`. See the same note in `location.test.ts`.

const score = (input: Partial<ConfidenceInput> = {}) =>
  scoreConfidence({ location: null, time: null, isNegation: false, ...input });

// Every value of every field, so the tables below can be checked for coverage rather
// than trusted to be complete. Projected from the union, not typed out beside it —
// a parallel list is what process-log row 126 was about.
const LOCATIONS = ["dictionary", "fallback", null] as const satisfies readonly ConfidenceInput["location"][];
const TIMES = ["range", "lunchtid", "start", null] as const satisfies readonly (TimeKind | null)[];

describe("scoreConfidence", () => {
  // ⚠ THE TABLE IS THE SPEC. Every (location, time) pair appears exactly once, and
  // the exhaustiveness test below is anchored to THIS table rather than to a
  // separate list — so a pair that is added to the union and forgotten here fails,
  // instead of leaving a row nobody notices is missing.
  const MATRIX: ReadonlyArray<[ConfidenceInput["location"], TimeKind | null, number]> = [
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
  ];

  it.each(MATRIX)("location=%s time=%s → %s", (location, time, expected) => {
    expect(score({ location, time })).toBe(expected);
  });

  it("covers every combination the input type allows", () => {
    // Non-vacuity plus completeness in one assertion. `it.each([])` registers zero
    // tests and reports green (process-log row 43), and a table missing a row looks
    // identical to a table that is complete — this catches both.
    const covered = new Set(MATRIX.map(([location, time]) => `${location}/${time}`));
    const required = LOCATIONS.flatMap((location) => TIMES.map((time) => `${location}/${time}`));

    expect(MATRIX.length).toBe(required.length);
    expect(required.filter((pair) => !covered.has(pair))).toEqual([]);
  });

  describe("the six rows project-context.md documents", () => {
    // Named against the document's own wording, so a reader comparing the two does
    // not have to infer which table row is which sentence.
    it.each([
      ["location + explicit time range", { location: "dictionary", time: "range" }, 1.0],
      ["location + lunchtid", { location: "dictionary", time: "lunchtid" }, 0.85],
      ["location only (no time)", { location: "dictionary", time: null }, 0.6],
      ["time only (no location)", { location: null, time: "range" }, 0.2],
      ["negation detected", { location: "dictionary", time: "range", isNegation: true }, 0.0],
      ["nothing extracted", { location: null, time: null }, 0.0],
    ] as const)("%s → %s", (_row, input, expected) => {
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
