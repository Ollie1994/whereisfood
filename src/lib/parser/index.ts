import { extractAddressCandidate } from "@/lib/parser/address";
import { scoreConfidence } from "@/lib/parser/confidence";
import { extractDate } from "@/lib/parser/date";
import { extractLocation } from "@/lib/parser/location";
import { detectNegation } from "@/lib/parser/negation";
import { normalizeCaption } from "@/lib/parser/normalize";
import { extractTime } from "@/lib/parser/time";
import type { ParseResult, ResolvedPlace } from "@/lib/types";

// Step 5, and the last pure one. Composes the extractors into the parser's single
// entry point — the seam `services/locations.ts` (#68), `scripts/reparse.mjs` (#71)
// and a future ML parser all sit behind.
//
// Pure — no DB, no HTTP, no clock. Enforced by `purity.test.ts` in this directory.
//
// ⚠ THE ORDER IS A BUSINESS RULE, NOT AN IMPLEMENTATION DETAIL, which is the whole
// reason this composition is a tested pure function instead of six calls inlined in a
// service. Two properties of it are load-bearing and both are asserted by test rather
// than by reading the code below:
//
//   NEGATION BAILS FIRST. "Inställt idag vid Järntorget" names a place, a day and
//   arguably a window, and every extractor will happily find them. Running them and
//   then setting `parserConfidence = 0` is NOT equivalent to not running them: #68
//   branches on `place`, and a cancellation carrying a resolved Järntorget is one
//   careless `if (result.place)` away from pinning the truck at the spot it just
//   said it would not be at. `scoreConfidence` short-circuits on negation too, and
//   says in its own comment that the short-circuit is the guarantee and this order is
//   the optimisation. Both are true, and they defend different things — that one
//   defends the SCORE, this one defends the FIELDS.
//
//   THE ADDRESS FALLBACK RUNS ONLY ON A DICTIONARY MISS. The plan states this as an
//   acceptance criterion in its own right, and the reason is one layer down: a
//   `fallback` place is what puts a caption on the wire to Nominatim, so computing
//   one for a caption we already resolved would spend a network call to re-derive an
//   answer we hold — and `-torget` is a street suffix, so `extractAddressCandidate`
//   would cheerfully re-match "Järntorget" as an unknown square. Ordering is the only
//   thing keeping those two modules apart; `address.ts` imports no dictionary.

// WHAT THE CALLER OWES THIS FUNCTION.
//
// `parsedAt` is the Stockholm calendar date (`"yyyy-MM-dd"`) the caption should be
// read AGAINST, and it is a parameter rather than something derived here for the
// reason the whole directory is pure: `new Date()` inside the parser would make
// "idag" mean the day the code RAN rather than the day the truck POSTED.
//
// Plan hazard H3 fixes the one derivation both callers use:
//
//   parsedAt = format(toZonedTime(post.posted_at, "Europe/Stockholm"), "yyyy-MM-dd")
//
// On the live path `posted_at` ≈ now, so it is the same value. On a replay through
// `scripts/reparse.mjs` it is the difference between resurrecting a three-day-old
// "idag" as today's pin and reading it as the day it was written.
export function parseCaption(caption: string, parsedAt: string): ParseResult {
  // Step 0. Everything downstream expects normalized, NFC text — `location.ts`,
  // `address.ts`, `negation.ts` and `date.ts` each carry the same warning that
  // decomposed "ä" silently defeats their vocabularies.
  const normalized = normalizeCaption(caption);

  // Step 1, and it RETURNS rather than setting a flag. See the order note above.
  if (detectNegation(normalized)) return negation(parsedAt);

  // Step 2. The dictionary first; the address fallback only if it missed.
  const place = resolvePlace(normalized);

  // Step 3. Date before time, because `extractTime` builds its UTC instants on a
  // calendar date and has no way to guess one — "11-14" is a wall clock until
  // something says which day's 11:00 it is, and which day decides the DST offset.
  //
  // ⚠ THE PAIRING BELOW IS PER-CAPTION, AND A CAPTION MAY HOLD MORE THAN ONE CLAIM.
  // Each extractor answers correctly for the whole caption; this line pairs the
  // answers, and for a two-clause caption the pair is a triple neither clause states:
  //
  //   parseCaption("Heden 11-14, imorgon Lindholmen 17-20", "2026-08-22")
  //     → place Heden (leftmost), date tomorrow (the only date word), time 11-14
  //       (the first range), scored 1.0
  //
  // Today's place, tomorrow's date, today's window — at MAXIMUM confidence, because
  // the matrix scores what was extracted and every part was extracted successfully.
  // `time.ts` and `location.ts` each record their half of this and both assign the
  // fix here, since it is a change to how the pipeline is composed rather than to any
  // extractor. It is NOT fixed in #67: the cheapest real fix is clause segmentation,
  // which is a different-sized change and may be worth deciding together with #80's
  // negation scoping — the same shape, one clause creating and one cancelling.
  //
  // Tracked as #94 and pinned by a test, so the behaviour is recorded rather than
  // merely known. The wrong pin is bounded only by `expires_at`, not by confidence.
  const date = extractDate(normalized, parsedAt);
  const time = extractTime(normalized, date);

  return {
    isNegation: false,
    place,
    date,
    time,
    // Read straight off the two fields above rather than rederived. `place?.kind` IS
    // `scoreConfidence`'s location axis (`"dictionary" | "fallback" | null`) and
    // `time?.kind` is its time axis, which is why `ParseResult` holds those two
    // shapes whole — a hand-written mapping between them is a place they could drift
    // apart, and there is no such mapping here to get wrong.
    parserConfidence: scoreConfidence({
      location: place?.kind ?? null,
      time: time?.kind ?? null,
      isNegation: false,
    }),
  };
}

// The dictionary/fallback/nothing decision, as one function because it is one
// decision — the three outcomes are mutually exclusive and `ResolvedPlace` is the
// type that says so.
function resolvePlace(normalized: string): ResolvedPlace {
  const match = extractLocation(normalized);
  if (match !== null) return { kind: "dictionary", match };

  const address = extractAddressCandidate(normalized);
  if (address !== null) return { kind: "fallback", address };

  return null;
}

// ⚠ `date` IS `parsedAt`, NOT THE DAY THE CAPTION NAMES, and that is a known gap
// tracked as #80 rather than an oversight.
//
// It is the same value `extractDate` itself returns for a caption containing no date
// word, so today it is wrong for exactly one shape: a cancellation that names a day
// other than the post's own ("inställt imorgon", "stängt på lördag"). #69 resolves
// the cancellation window from this field, so until #80 lands such a post cancels the
// day it was SENT.
//
// Not fixed here by simply calling `extractDate` before the bail, tempting as that
// is. `date.ts` records the reason under #80: a leading cancellation tag changes
// which date expression in the caption is the operative one, so "the day the negation
// names" is a different question from "the day this caption is about" — and answering
// the second and labelling it the first is how a cancellation deletes the wrong day's
// pin. #80 is where that question gets answered, because it needs `negation.ts` to
// report WHICH span it fired on, which is a change to that module rather than to this
// composition.
//
// ⚠ THIS IS THE EXPENSIVE DIRECTION TO FAIL IN, NOT THE SAFE ONE. An earlier version
// of this comment called it "the conservative miss — it cancels a day the truck was
// plausibly talking about, and the truck can post again". That is backwards, and
// #80's own repro is the counterexample:
//
//   parseCaption("Vi står på Heden 11-14 idag, stängt på söndag", "2026-08-22")
//     → isNegation: true, date: "2026-08-22"
//
// A truck saying "we're at Heden 11-14 today, closed on Sunday" gets TODAY deleted —
// per plan #1 a negation deletes overlapping locations, so #69 removes the pin of a
// truck standing there right now, with nothing signalling it happened. `negation.ts`
// and #80 both classify a false cancellation as the asymmetrically expensive failure,
// and the rule is "fail toward NOT a cancellation": a missed cancellation is a stale
// pin `expires_at` clears within hours, a false one deletes a present truck.
//
// So the gap is deferred because fixing it needs #80's span reporting, NOT because
// the current direction is the cautious one. The distinction matters: the first
// framing gets #80 prioritised, the second gets it postponed.
//
// Every other field is at its empty value, which is the fields half of the guarantee
// the order note describes.
function negation(parsedAt: string): ParseResult {
  return {
    isNegation: true,
    place: null,
    date: parsedAt,
    time: null,
    // Not the literal `0`: routed through `scoreConfidence` so the negation score
    // lives in exactly one place. If the matrix ever scores a cancellation as
    // something other than zero, it changes there and this follows.
    parserConfidence: scoreConfidence({ location: null, time: null, isNegation: true }),
  };
}
