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
//   A NEGATION SUPPRESSES THE PLACE, AND ONLY THE PLACE. "Inställt idag vid
//   Järntorget" names a place, a day and arguably a window, and every extractor will
//   happily find all three. The place must not survive: #68 branches on `place`, and
//   a cancellation carrying a resolved Järntorget is one careless `if (result.place)`
//   away from pinning the truck at the spot it just said it would not be at. Setting
//   `parserConfidence = 0` is not equivalent — `scoreConfidence` short-circuits on
//   negation too, but that defends the SCORE while this defends the FIELDS.
//
//   ⚠ THE DATE AND THE WINDOW MUST SURVIVE, AND A BLANKET BAIL DROPPED THEM. The
//   first version of this file returned early on a negation with `date: parsedAt` and
//   `time: null`, having argued the case for `place` and then applied it to all three
//   without noticing. Phase plan decision #1 is explicit about what a cancellation
//   needs, and it is the opposite:
//
//     "Cancellation window: the extracted time range if there is one, otherwise the
//      full Stockholm day of the extracted date."
//
//   So the window IS the payload of a cancellation — the one thing #69 cannot resolve
//   without. Verified: `parseCaption("Inställt 11-14 idag", …)` returned `time: null`
//   while `extractTime` on the same caption returned 09:00Z–12:00Z, so a truck
//   cancelling only its lunch slot would have fallen through to the full-day rule and
//   had its separate 17–20 pin deleted as well. A cancellation that deletes more than
//   it names is the asymmetrically expensive failure `negation.ts` warns about,
//   reached here by discarding data rather than by mis-detecting it.
//
//   Two lessons, and the second is the one that generalises: a suppression rule
//   argued for ONE field must be applied to one field; and the issue's acceptance
//   criteria said "no attempt to extract location, date or time", which is where the
//   blanket version came from — CLAUDE.md settles that conflict, THE PLAN WINS.
//
//   THE ADDRESS FALLBACK RUNS ONLY ON A DICTIONARY MISS. The plan states this as an
//   acceptance criterion in its own right, and the reason is one layer down: a
//   `fallback` place is what puts a caption on the wire to Nominatim, so computing
//   one for a caption we already resolved would spend a network call to re-derive an
//   answer we hold. `-torget` is a street suffix, so a known square CAN be re-matched
//   here — ordering is the only thing keeping the two modules apart, and `address.ts`
//   imports no dictionary by construction.
//
//   ⚠ THE OVERLAP IS NARROWER THAN THE OBVIOUS STATEMENT OF IT, and an earlier
//   version of this comment made the wide one — that `extractAddressCandidate` "would
//   cheerfully re-match Järntorget". It would not, for most captions naming it:
//
//     "Järntorget"             → null      "vid Järntorget idag"  → null
//     "Järntorget 11-14"       → null      "Järntorget 12"        → "Järntorget 12"
//
//   Since PR #89 r4 a candidate is a suffix-compound followed by a HOUSE NUMBER, with
//   no bare-suffix form left, so the collision needs a number the dictionary name does
//   not carry. The ordering rule is unchanged and still load-bearing — "Järntorget 12"
//   is a real caption shape and is exactly what the test below pins — but the failure
//   it prevents is that row, not every mention of a known square. The wide version was
//   inherited from `address.ts`'s own header, which states it the same way; worth
//   correcting there too rather than only here.

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

  // Step 1. See the order note above for what this suppresses, and what it must not.
  const isNegation = detectNegation(normalized);

  // Step 2. The dictionary first; the address fallback only if it missed — and NOT AT
  // ALL on a negation, which is the one thing the cancellation path must not carry.
  const place = isNegation ? null : resolvePlace(normalized);

  // Step 3. Date before time, because `extractTime` builds its UTC instants on a
  // calendar date and has no way to guess one — "11-14" is a wall clock until
  // something says which day's 11:00 it is, and which day decides the DST offset.
  //
  // ⚠ THE PAIRING BELOW IS PER-CAPTION, AND A CAPTION MAY HOLD MORE THAN ONE CLAIM.
  // Each extractor answers correctly for the whole caption; this line pairs the
  // answers, and for a two-clause caption the pair is a triple neither clause states:
  //
  //   parseCaption("Heden 11-14, imorgon Lindholmen 17-20", "2026-08-22")
  //     → place Heden, date tomorrow (the only date word), time 11-14 (the first
  //       range), scored 1.0
  //
  // Today's place, tomorrow's date, today's window — at MAXIMUM confidence, because
  // the matrix scores what was extracted and every part was extracted successfully.
  //
  // ⚠ "HEDEN, LEFTMOST" IS WHAT THIS SAID, AND THE SECOND WORD IS WRONG. `location.ts`
  // resolves leftmost-longest AMONG DICTIONARY ALIASES; `resolvePlace` below then
  // prefers any dictionary hit over any address candidate, with no comparison of
  // position. So the place is leftmost only when both candidates are dictionary hits,
  // which is true of that caption and not true in general:
  //
  //   "Vi står på Kungsgatan 12 idag 11-14, imorgon Heden 17-20"
  //     → place HEDEN, from the second clause, over an address candidate in the first
  //     → paired with today's 11-14, at 1.0
  //
  // The rule is defensible — a reviewed dictionary coordinate beats an unreviewed
  // geocode, which is the whole design — but it is a PREFERENCE ORDER, not a position
  // rule, and calling it leftmost hid a second way the pairing goes wrong. Recorded on
  // #94, which now covers both.
  // `time.ts` and `location.ts` each record their half of this and both assign the
  // fix here, since it is a change to how the pipeline is composed rather than to any
  // extractor. It is NOT fixed in #67: the cheapest real fix is clause segmentation,
  // which is a different-sized change and may be worth deciding together with #80's
  // negation scoping — the same shape, one clause creating and one cancelling.
  //
  // Tracked as #94 and pinned by a test, so the behaviour is recorded rather than
  // merely known. The wrong pin is bounded only by `expires_at`, not by confidence.
  //
  // ⚠ A SECOND SHAPE INVERTED RATHER THAN MISPAIRING — #96, now FIXED in `date.ts`.
  // A caption stating hours and excluding a day resolved to the excluded day:
  //
  //   parseCaption("Heden 11-14 (ej söndag)", "2026-08-22")
  //     was  → date 2026-08-23 (Sunday, the excluded day), 1.0
  //     now  → date 2026-08-22 (the posting day)
  //
  // It turned out NOT to be a composition defect, which is why it was fixed one layer
  // down and this comment is a pointer rather than a plan. `detectNegation` is right
  // not to fire — #82 constrains `ej` to an operating verb or an open state, and a
  // weekday is neither, so the post is a positive statement with a carve-out and
  // firing would DELETE the pin. Only `extractDate`'s choice of day was wrong, and it
  // now carries a `NOT_EXCLUDED` lookbehind alongside the `NOT_BACKWARD` it already
  // had.
  //
  // ⚠ TWO REMNANTS OF IT ARE STILL LIVE AND REACH THIS LINE, both tracked as #102:
  // suppressing the named day falls back to `parsedAt`, which can ITSELF be the
  // excluded day ("alla dagar utom lördag", posted on a Saturday → lördag, at 1.0);
  // and the exclusion chain can cross a clause boundary that opens on a weekday,
  // losing a stated date. Both need something this composition does not have — a way
  // for `extractDate` to say "no usable date", or clause boundaries.
  const date = extractDate(normalized, parsedAt);
  const time = extractTime(normalized, date);

  return {
    isNegation,
    place,
    date,
    time,
    // Read straight off the two fields above rather than rederived. `place?.kind` IS
    // `scoreConfidence`'s location axis (`"dictionary" | "fallback" | null`) and
    // `time?.kind` is its time axis, which is why `ParseResult` holds those two
    // shapes whole — a hand-written mapping between them is a place they could drift
    // apart, and there is no such mapping here to get wrong.
    //
    // `isNegation` still reaches the score, and `scoreConfidence` still short-circuits
    // on it to 0.0 — that did not change when the bail narrowed. A cancellation's
    // `time` is now populated and must NOT be allowed to score it as a location.
    parserConfidence: scoreConfidence({
      location: place?.kind ?? null,
      time: time?.kind ?? null,
      isNegation,
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
