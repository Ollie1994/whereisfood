import type { TimeKind } from "@/lib/parser/time";

// Step 4 of the pipeline. Turns what the extractors found into `parser_confidence` —
// the number the locations service multiplies by `source_confidence` to get the value
// the map filters on.
//
// Pure — no DB, no HTTP, no clock. Enforced by `purity.test.ts` in this directory.
//
// SCORES WHAT WAS EXTRACTED, NOT WHETHER IT IS TRUE. A caption naming Järntorget and
// 11-14 scores 1.0 whether or not the truck turns up; the number says "the caption
// stated a place and a window", and the lane's `source_confidence` is what carries
// how much the STATEMENT is worth. Keeping the two axes separate is what lets the
// same caption score differently by lane without this module knowing lanes exist.

// ⚠ THE INPUT SHAPE DIFFERS FROM #66's, and both changes remove states that cannot
// happen rather than adding capability.
//
//   #66 specifies `hasLocation` + `locationFromFallback` as two booleans. They are
//   mutually exclusive — a location is resolved by the dictionary or by the geocode
//   fallback, never both, and `{ hasLocation: true, locationFromFallback: true }` has
//   no meaning. Three states, one field.
//
//   #66 specifies `hasExplicitTimeRange` + `hasLunchtid`, also mutually exclusive,
//   and they cannot express `TimeKind`'s third value at all. `time.ts` widened that
//   type to `range | lunchtid | start` in #58 and left the instruction here: "the
//   intended mapping is `range` 1.0, `lunchtid` 0.85, and `start` no higher than
//   `lunchtid`, since it carries strictly less information than either". Two booleans
//   would have silently scored a marked start as either a full range or as no time.
//
// Taking `TimeKind` itself also means this module cannot drift from `time.ts`: adding
// a fourth kind there becomes a compile error here rather than a row that quietly
// falls through to the default.
export interface ConfidenceInput {
  // How the location was resolved, or `null` when the caption named no place.
  //
  // `"fallback"` means `extractLocation` missed and `extractAddressCandidate` found an
  // address — it does NOT mean the geocode succeeded, which is unknowable in a pure
  // function. That is sound because a failed geocode writes no `locations` row at all
  // (`parsing_status = 'failed'`), so a score computed for one is never used.
  readonly location: "dictionary" | "fallback" | null;
  // What `extractTime` returned, or `null` when the caption stated no time.
  readonly time: TimeKind | null;
  readonly isNegation: boolean;
}

// The documented matrix, by how the location was resolved.
//
// ⚠ WRITTEN AS EXACT LITERALS, NOT AS ARITHMETIC, and this is not a style preference.
//
// The fallback penalty looks like a clean constant: 1.0→0.85, 0.85→0.70, 0.60→0.45 is
// −0.15 three times, and `base - 0.15` is the obvious implementation. In IEEE 754 it
// is not:
//
//   1.0  - 0.15 === 0.85   true
//   0.85 - 0.15 === 0.7    true
//   0.60 - 0.15 === 0.45   FALSE — it is 0.44999999999999996
//
// The display threshold is `combined >= 0.45`, and plan decision #3 places a
// location-only fallback exactly ON that line. Computing it would put it a
// hairsbreadth below, so every such pin would vanish from the map — silently, with no
// error anywhere, and for a reason invisible in the source. Verified before choosing
// the shape rather than discovered from a map missing markers.
//
// So both columns are typed out. The relationship is still worth knowing and is
// asserted in the tests; it is just not worth computing.
// ⚠ KEYED ON BOTH AXES, so neither can drift silently. An earlier version dispatched
// with `location === "dictionary" ? DICTIONARY : FALLBACK`, which is not exhaustive: a
// third way of resolving a location — a cache hit, a paid provider — would have scored
// as a geocode fallback, quietly, while this file claimed such drift becomes a compile
// error. That claim was true of the `time` axis (a `Record` over `TimeKind`) and false
// of the `location` axis, which is exactly the kind of half-true guarantee this PR
// series has been punished for. Now both axes are `Record` keys and a new variant on
// either fails the build.
const SCORES: Record<ResolvedLocation, Record<TimeKindOrNone, number>> = {
  dictionary: {
    // The caption stated a place and a full window. Nothing more to want.
    range: 1.0,
    // A complete window, but one this system INFERRED from a word rather than one the
    // truck wrote. Same instants as "11-14", less certainty about intent.
    lunchtid: 0.85,
    // An opening time with no close — "Heden kl 11". More than a bare location, less
    // than either complete window. `time.ts` fixed the constraint ("no higher than
    // lunchtid") and this picks the value inside it.
    //
    // ⚠ NOT IN THE DOCUMENTED MATRIX. `project-context.md` has six rows and this is a
    // seventh, arriving with `TimeKind`'s third value. Reconciling that doc is #73's
    // job; recorded here so the gap is a known one rather than a discrepancy someone
    // finds later and resolves by guessing.
    start: 0.7,
    // Location only. The caption said where but not when, which is an ordinary thing
    // to post — the locations service supplies the `posted_at + 8h` expiry.
    none: 0.6,
  },
  fallback: {
    range: 0.85,
    lunchtid: 0.7,
    // 0.7 - 0.15. Sits where a dictionary lunchtid's penalised score also sits, which
    // is a coincidence of the ladder rather than a claim that the two are equivalent.
    start: 0.55,
    // Exactly the display threshold, by design (#3): a fallback location with no time
    // is the weakest thing still worth showing, and only from a lane trusted enough to
    // carry it there.
    //
    // ⚠ THIS EXACT VALUE NARROWS BADLY AT PERSISTENCE, a second and independent
    // narrowing of the same constant the header defends against.
    //
    // VERIFIED: `locations.confidence` is `float4` (migration 0001:70), and float32
    // cannot represent 0.45 — the nearest float32 is 0.44999998807907104. Combined
    // with `source_confidence`, exactly one reachable stored value is affected:
    // `0.45 × manual(1.0)`. Every other product clears the threshold with room to
    // spare. Both facts are asserted in the tests, over the products rather than over
    // these parser scores, since the products are what the column holds.
    //
    // ⚠ NOT VERIFIED, and deliberately not asserted here: whether any given comparison
    // actually drops the row. There are three paths and they need not agree —
    //
    //   PostgREST sends an untyped literal, which Postgres resolves against the
    //   column's own type; both sides would narrow identically and the row comes back.
    //   Raw SQL, a `float8` RPC parameter or a view can keep 0.45 as a double, where
    //   it would not.
    //   CLIENT-SIDE, in JavaScript, on a value read back out of the column. This one
    //   exists TODAY — `useMapLibre.tsx` filters `l.confidence >= DISPLAY_THRESHOLD`,
    //   with 0.45 written out a second time there. No query typing protects it: it
    //   depends entirely on what text Postgres emits for the stored float4 and how JS
    //   parses it.
    //
    // An earlier version of this comment said "safe today only because nothing queries
    // it yet". That was wrong twice over — a consumer already exists, and I asserted
    // its absence without grepping for one. It reads `fake-data.ts` until Phase 4, so
    // the path is unexercised rather than absent, which is not the same claim.
    //
    // An earlier version of this comment stated flatly that `.gte("confidence", 0.45)`
    // drops the pin. That was reasoning about Postgres presented as a checked fact —
    // no Postgres was run, and review argues the opposite for that specific path. The
    // honest position is that the representation is verified and the comparison is
    // path-dependent and untested.
    //
    // Which way it resolves changes WHAT #92 should do, not whether it is worth doing:
    // if PostgREST is safe, the risk is a later author "fixing" the one call that was
    // never broken while a raw-SQL path stays unguarded. #92's first job is to
    // determine this against a real database, which is the only place it is decidable.
    none: 0.45,
  },
};

// A caption that named no place scores on what little is left, and the fallback
// penalty cannot apply — there is no location for it to have resolved.
const TIME_ONLY = 0.2;
const NOTHING = 0.0;

// A negation is not a low-confidence location; it is a different KIND of post. The
// locations service compares `source_confidence` when deciding whether a cancellation
// may delete an existing pin (#1), precisely so that this 0.0 does not interfere.
const NEGATION = 0.0;

// `TimeKind | null` as a key, since `null` cannot index a `Record`. Keeping the four
// cases in one union is what makes the tables above exhaustively checked: adding a
// kind to `time.ts` fails the build here instead of falling through.
type TimeKindOrNone = TimeKind | "none";

// The location axis minus `null`, which is handled before the tables are reached.
// Derived from `ConfidenceInput` rather than written out, so the two cannot disagree.
type ResolvedLocation = Exclude<ConfidenceInput["location"], null>;

export function scoreConfidence(input: ConfidenceInput): number {
  // FIRST, AND UNCONDITIONALLY. `parseCaption` already bails on a negation before
  // running the other extractors, so in the live pipeline nothing else is populated —
  // but this module is called with whatever it is given, and a negation that scored on
  // an incidentally-extracted location would put a cancelled truck on the map. The
  // short-circuit is the guarantee; the pipeline order is the optimisation.
  if (input.isNegation) return NEGATION;

  const time: TimeKindOrNone = input.time ?? "none";

  if (input.location === null) {
    return time === "none" ? NOTHING : TIME_ONLY;
  }

  // Indexed rather than branched, which is what makes the location axis exhaustive:
  // `input.location` is narrowed to `ResolvedLocation` here, and a variant added to
  // that union leaves `SCORES` missing a key and fails the build.
  return SCORES[input.location][time];
}
