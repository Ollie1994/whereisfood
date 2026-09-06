import { describe, expect, it } from "vitest";
import { allowOnly, findImpurities, readModuleSource } from "@/lib/test-utils/purity";
import type { Location, Post } from "@/lib/types";
import { postSourceToLane, sourceConfidence } from "./sources";

// THE EXPECTED MAPPINGS, written out literally and never derived from the modules
// under test. Deriving them would make every assertion below a tautology — each
// map checked against itself, where a wrong lane agrees with itself perfectly.
//
// These two tables are the ONLY lists in this file. An earlier version also kept
// separate `ALL_PLATFORMS` / `ALL_LANES` arrays for the iterating tests, which made
// three parallel lists and opened the gap described below; the iteration lists are
// now projected from these, so there is one place to update and it is the one the
// compiler checks.
const LANE_BY_PLATFORM = [
  ["instagram", "webhook"],
  ["facebook", "webhook"],
  ["tiktok", "webhook"],
  ["email", "email"],
  ["manual", "manual"],
  ["webhook", "webhook"],
] as const satisfies readonly (readonly [Post["source"], Location["source"]])[];

const CONFIDENCE_BY_LANE = [
  ["manual", 1.0],
  ["webhook", 0.85],
  ["email", 0.55],
] as const satisfies readonly (readonly [Location["source"], number])[];

// `satisfies` catches a TYPO — "instgram" stops compiling. It does not catch an
// OMISSION, which is the failure that actually matters here, and the omission has
// two distinct shapes:
//
//   1. A seventh platform missing from the table entirely. The `Record` in
//      sources.ts would already fail to compile, so this is a second line.
//   2. A seventh platform present everywhere BUT the expectation table — added to
//      the union, added to the `Record`, mapped to a wrong-but-valid lane. Every
//      structural check passes: the `Record` is complete, the range check sees a
//      legal lane, nothing returns undefined. Verified before fixing — `bluesky`
//      mapped to `manual` compiled clean and left this suite green at 15/15, which
//      would have given a Bluesky post source confidence 1.0, scoring it as though
//      a human had typed it into the dashboard.
//
// Anchoring the assertion to the TABLE rather than to a separate list closes both:
// the expectation table is now the thing required to be exhaustive.
//
// `AssertCovered<T>` rather than the obvious conditional spelling
// (`Exclude<...> extends never ? true : never`), because the error message is the
// entire point. The conditional reports "Type 'true' is not assignable to type
// 'never'" — true, unhelpful, and it leaves you diffing lists by eye. Constraining
// reports `Type '"bluesky"' does not satisfy the constraint 'never'` and hands you
// the missing member.
//
// Bound to a `void`-ed const rather than left as a bare `type` alias: an unused
// type alias is an unused-vars warning, and silencing that would mean loosening the
// rule project-wide for a need local to this file.
type AssertCovered<T extends never> = T;
const _platformsCovered: AssertCovered<
  Exclude<Post["source"], (typeof LANE_BY_PLATFORM)[number][0]>
>[] = [];
const _lanesCovered: AssertCovered<
  Exclude<Location["source"], (typeof CONFIDENCE_BY_LANE)[number][0]>
>[] = [];
void _platformsCovered;
void _lanesCovered;

// Projected from the tables above, so they cannot drift from them. Still
// independent of the implementation, which is what keeps the assertions honest.
const ALL_PLATFORMS = LANE_BY_PLATFORM.map(([platform]) => platform);
const ALL_LANES = CONFIDENCE_BY_LANE.map(([lane]) => lane);

describe("postSourceToLane", () => {
  it.each(LANE_BY_PLATFORM)("maps %s to the %s lane", (platform, lane) => {
    expect(postSourceToLane(platform)).toBe(lane);
  });

  it("maps every platform to one of exactly three lanes", () => {
    // The acceptance criterion stated directly. Distinct from the table above:
    // that one pins each mapping, this one proves the RANGE is closed, so a
    // future platform mapped to a typo'd lane fails here even if someone adds a
    // matching row to the table.
    for (const platform of ALL_PLATFORMS) {
      expect(ALL_LANES).toContain(postSourceToLane(platform));
    }
  });

  it("never returns undefined for a valid platform", () => {
    // `Record` lookups are typed as total but return `undefined` at runtime for a
    // missing key, and `locations.source` is NOT NULL — so a gap here surfaces as
    // a constraint violation on insert rather than as a type error.
    for (const platform of ALL_PLATFORMS) {
      expect(postSourceToLane(platform)).toBeDefined();
    }
  });
});

describe("sourceConfidence", () => {
  it.each(CONFIDENCE_BY_LANE)("scores the %s lane at %s", (lane, expected) => {
    expect(sourceConfidence(lane)).toBe(expected);
  });

  it("ranks the lanes manual > webhook > email", () => {
    // The ORDER carries product meaning the three literals do not. The override
    // rule is "higher source confidence replaces lower", so this ranking is what
    // makes a dashboard entry beat a webhook and a webhook beat an email. Someone
    // retuning the numbers later must preserve the ordering or the override matrix
    // silently changes behaviour — this fails loudly if they do not.
    expect(sourceConfidence("manual")).toBeGreaterThan(sourceConfidence("webhook"));
    expect(sourceConfidence("webhook")).toBeGreaterThan(sourceConfidence("email"));
  });

  it("keeps every lane a usable multiplier", () => {
    // It multiplies `parser_confidence`, so 0 would zero out every location from a
    // lane and anything above 1 would let the source inflate the parser's own
    // score past what it claimed.
    for (const lane of ALL_LANES) {
      expect(sourceConfidence(lane)).toBeGreaterThan(0);
      expect(sourceConfidence(lane)).toBeLessThanOrEqual(1);
    }
  });

  it("can score the lane produced by any platform", () => {
    // The two functions are only useful composed — this is the seam #68 will
    // actually call. Tested as a pair because a lane value that is valid for one
    // and unknown to the other would pass both suites above.
    for (const platform of ALL_PLATFORMS) {
      const score = sourceConfidence(postSourceToLane(platform));
      expect(Number.isFinite(score)).toBe(true);
    }
  });
});

describe("sources.ts purity", () => {
  // `sources.ts` lives in `src/lib/`, OUTSIDE the directory
  // `parser/purity.test.ts` globs — so it inherits nothing and needs its own
  // guard. `geo.ts` is the precedent. The mechanism lives in
  // `@/lib/test-utils/purity` (#75) and is verified adversarially there; nothing
  // here re-implements any part of it.
  //
  // ⚠ POLICY NOTE. The handover on #59 specified `FORBID_ALL_IMPORTS`, reasoning
  // that "sources.ts needs nothing at all". That turned out to be wrong, and in a
  // way worth recording rather than quietly fixing: the same issue also specifies
  // both functions as typed against `Post["source"]` and `Location["source"]` from
  // `@/lib/types`, which is an import. The two halves of the issue contradict each
  // other, and the typing requirement is the one that matters — hand-copying the
  // unions here is exactly the drift the mapping exists to prevent.
  //
  // So `allowOnly(["@/lib/types"])`. That import is type-only and erased, and
  // `types.ts` is itself guarded by `types.test.ts`, so the chain is asserted end
  // to end rather than trusted.
  it("imports only the shared types, and never touches the network or clock", () => {
    const violations = findImpurities(
      readModuleSource(new URL("./sources.ts", import.meta.url).href),
      allowOnly(["@/lib/types"]),
    );

    expect(violations).toEqual([]);
  });
});
