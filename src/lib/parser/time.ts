// Extracts the serving window from a caption and converts it to UTC instants.
//
// Pure — no DB, no HTTP, no clock. Enforced by `purity.test.ts` in this directory.
// The calendar date is passed in (from `extractDate`), never read from the clock.
//
// ─────────────────────────────────────────────────────────────────────────────
// THIS IS THE SEAM `date.ts` DEFERRED TO, and the reason it imports `date-fns-tz`
// where its sibling deliberately does not.
//
// A calendar date has no timezone — "2026-08-22 plus one day" has the same answer
// everywhere — so `date.ts` does exact UTC arithmetic and needs no library. A wall
// CLOCK does have one: "11:00 in Gothenburg" is 09:00Z in August and 10:00Z in
// January. The moment a date and a time combine into an instant, the offset stops
// being avoidable and starts being the whole problem. That is here.
//
// So `fromZonedTime` is used for every conversion, and no instant in this module is
// built by arithmetic on another instant. The midnight roll below is the case that
// makes the distinction concrete rather than theoretical.
// ─────────────────────────────────────────────────────────────────────────────

import { fromZonedTime } from "date-fns-tz";
import { addCalendarDays } from "@/lib/parser/date";

// Every time in a caption is Stockholm wall-clock time. Storage is always UTC.
const TIME_ZONE = "Europe/Stockholm";

// `lunchtid` — the one named window, fixed by the plan and by project-context at
// 11:00–14:00 Europe/Stockholm. It is an INFERENCE, not something the truck stated,
// which is why `kind` keeps it distinguishable and why an explicit range outranks it.
const LUNCHTID_START = { hour: 11, minute: 0 };
const LUNCHTID_END = { hour: 14, minute: 0 };

// `kind` IS LOAD-BEARING, NOT DECORATION. The confidence matrix scores
// "location + explicit time range" at 1.0 and "location + lunchtid" at 0.85, so
// without this discriminator the two produce identical values and `scoreConfidence`
// (#66) cannot tell them apart. It records WHAT THE CAPTION SAID, not what the
// window turned out to be — "lunchtid" and "11-14" yield the same instants and must
// still score differently.
export type TimeKind = "range" | "lunchtid";

export interface ExtractedTime {
  // UTC ISO instants.
  startsAt: string;
  // Null is MEANINGFUL and not an error: the caption gave no end, or gave one this
  // module refuses to represent (see the invariant check in `toWindow`). The
  // locations service applies its own `expires_at` fallback in that case — capping
  // an inferred end is its job, and #58 explicitly does not compute `expires_at`.
  endsAt: string | null;
  kind: TimeKind;
}

interface WallClock {
  hour: number;
  minute: number;
}

// Word boundaries WITHOUT `\b`, which is ASCII-only and therefore wrong for Swedish
// — the same reasoning `negation.ts` and `date.ts` carry, and for the same reason:
// `\w` excludes å/ä/ö, so `\b` manufactures boundaries inside words.
const BEFORE_WORD = "(?<![\\p{L}\\p{N}])";
const AFTER_WORD = "(?![\\p{L}\\p{N}])";

// A clock time: one or two digits, optionally a separator and two minute digits.
// Swedish writes both "11.30" and "11:30" and they mean the same thing.
//
// The hour is matched loosely as `\d{1,2}` and validated NUMERICALLY below rather
// than being pinned to `(?:[01]?\d|2[0-3])` in the pattern. Two reasons: the strict
// alternation silently matches a PREFIX of an out-of-range number ("25" yields "2"),
// which is worse than not matching; and a numeric check is the thing a reader can
// actually verify. Minutes are pinned in the pattern because `[0-5]\d` has no such
// prefix hazard — a "minute" of 60+ is not a near-miss, it is a different token.
const CLOCK = "(\\d{1,2})(?:[.:]([0-5]\\d))?";

// A range separator. The three dashes are the same character typographically —
// captions copy-paste en and em dashes freely — so this is one token written three
// ways, not three pieces of vocabulary.
const DASH = "\\s*[-\u2013\u2014]\\s*";

// DIGIT-ADJACENCY GUARDS, not word guards. A time is bounded by things that are not
// part of a number: `(?<![\d.:])` stops "61" being read out of the house number in
// "Nordostpassagen 61-63", and the trailing form stops a partial match leaving a
// stray fragment. `\p{L}` is deliberately NOT excluded here — "kl11-14" and
// "Lunch 11-14" both need the digits to be reachable.
const NOT_IN_NUMBER_BEFORE = "(?<![\\d.:])";
const NOT_IN_NUMBER_AFTER = "(?![\\d.:])";

// Markers that make a SINGLE time a time. Required, and this is the guard that keeps
// the module from inventing windows out of ordinary numbers.
//
// ⚠ A BARE NUMBER IS NOT A TIME, and treating one as a start is the failure mode
// this whole constant exists to prevent. Captions are full of numbers that are not
// clock times — "Vi har 3 nya rätter", "2 för 100 kr", "5 sorters korv" — and every
// one of them would otherwise produce a fabricated 03:00 start, a location row, and
// a pin. A RANGE is self-identifying (two valid hours joined by a dash, which prose
// numbers essentially never form); a lone number is not, so it has to be announced.
const START_MARKERS = ["kl", "klockan", "från"] as const;

// No `g` on the single-match patterns, deliberately: a global regex carries
// `lastIndex` across `.test()`/`.exec()` calls, so a module-level instance alternates
// between finding and not finding on identical input. `negation.ts` documents the
// same trap; it survives any single-call test.
//
// The `i` flag is what lets `normalizeCaption` leave casing alone — matching is each
// extractor's own concern.
const LUNCHTID = new RegExp(`${BEFORE_WORD}lunchtid${AFTER_WORD}`, "iu");

// `g` HERE IS REQUIRED AND SAFE, unlike above. These are consumed only through
// `String.prototype.matchAll`, which iterates over a CLONE of the regex — the
// original's `lastIndex` is never advanced, so the shared instance stays stateless.
// Verified by test, because "it's fine, matchAll clones" is exactly the kind of claim
// this project has been wrong about before.
//
// Scanning ALL candidates rather than the first is what makes numeric validation
// work: "Tacos 89-119 kr, öppet 11-14" offers an invalid candidate before a valid
// one, and taking the first MATCH would reject the caption while taking the first
// VALID match reads it correctly.
const RANGE = new RegExp(
  `${NOT_IN_NUMBER_BEFORE}${CLOCK}${DASH}${CLOCK}${NOT_IN_NUMBER_AFTER}`,
  "giu",
);

const MARKED_START = new RegExp(
  `${BEFORE_WORD}(?:${START_MARKERS.join("|")})\\.?\\s*${CLOCK}${NOT_IN_NUMBER_AFTER}`,
  "giu",
);

// A matched hour/minute pair, or null when the hour is out of range. Minutes are
// already constrained by the pattern; an absent minute group is :00.
//
// ⚠ THIS CHECK IS NOT REDUNDANT WITH THE `isNaN` GUARD IN `toInstant`, which is what
// it looks like at first and what mutation testing had to establish. Two reasons it
// carries its own weight:
//
//   HOUR 24 IS ACCEPTED SILENTLY. `fromZonedTime` returns an Invalid Date for 25 and
//   above, but resolves "T24:00:00" to midnight at the START of that day — so "24-01"
//   would become a window on the PREVIOUS day rather than no window. The library
//   cannot be relied on to reject an out-of-range hour.
//
//   IT DECIDES WHICH CANDIDATE IS CHOSEN. `firstValidRange` scans every match and
//   takes the first that validates HERE. Without this, "Korv 61-63 kr, öppet 11-14"
//   selects the price range, fails to convert it, and returns null for a caption
//   that plainly states a window — the failure moves from a skipped candidate to a
//   discarded caption.
function toWallClock(hour: string, minute: string | undefined): WallClock | null {
  const h = Number(hour);
  if (h > 23) return null;
  return { hour: h, minute: minute === undefined ? 0 : Number(minute) };
}

// Stockholm wall clock on a given calendar date → a UTC instant, or null when the
// date or the conversion cannot produce a real one.
//
// ⚠ THE `isNaN` CHECK IS LOAD-BEARING. `fromZonedTime` does not throw on a date it
// cannot read — it returns an Invalid Date, and `.toISOString()` on that is a
// `RangeError`. This module runs inside `after()`, where a throw is an unhandled
// rejection that loses the post, so the failure has to be converted into a value
// here. Same class as the `parsedAt` guard in `date.ts`.
function toInstant(date: string, time: WallClock): string | null {
  const hh = String(time.hour).padStart(2, "0");
  const mm = String(time.minute).padStart(2, "0");
  const instant = fromZonedTime(`${date}T${hh}:${mm}:00`, TIME_ZONE);
  const millis = instant.getTime();
  return Number.isNaN(millis) ? null : instant.toISOString();
}

// Build the window, applying the midnight roll and the never-negative invariant.
//
// THE ROLL IS DECIDED ON THE WALL CLOCK, NOT ON THE INSTANTS. "22-01" means 22:00
// today to 01:00 tomorrow, and the way to express that is to convert 01:00 against
// the NEXT CALENDAR DATE — not to add 24 hours to anything. Adding a fixed 24 hours
// is wrong by an hour across a DST boundary, which is the entire reason this module
// converts each endpoint from its own date rather than doing arithmetic on instants.
//
// ⚠ AND THE INVARIANT IS RE-CHECKED ON THE INSTANTS, because the wall clock is not
// sufficient to guarantee it. On the spring-forward day the 02:00–02:59 hour DOES
// NOT EXIST in Stockholm, and `fromZonedTime` maps those wall times back onto the
// preceding hour's instants — so "01:59-02:00" on 2026-03-29 converts to a window of
// MINUS 59 minutes even though 01:59 < 02:00 is plainly true. Verified by scanning
// every minute pair on both 2026 transition days: six such pairs exist, all on the
// gap day, all with an end inside the missing hour.
//
// When that happens the end is DROPPED rather than rolled. Rolling would turn a
// one-minute caption into a ~24-hour window — fabricating a full day out of a
// timezone artefact — while dropping it keeps the start, which is real, and hands
// the end to the locations service's `expires_at` fallback. `endsAt: null` is
// already a legitimate, meaningful state, so nothing downstream needs a new case.
//
// The same check subsumes the degenerate equal-time window: "11-11" is not negative,
// so it never triggers the roll, and a zero-length window would insert a row that
// can never overlap anything and is expired on arrival. One invariant — the end must
// be STRICTLY after the start — covers both without special-casing either.
function toWindow(
  date: string,
  start: WallClock,
  end: WallClock | null,
  kind: TimeKind,
): ExtractedTime | null {
  const startsAt = toInstant(date, start);
  if (startsAt === null) return null;

  if (end === null) return { startsAt, endsAt: null, kind };

  const rolls = end.hour * 60 + end.minute < start.hour * 60 + start.minute;
  const endDate = rolls ? addCalendarDays(date, 1) : date;
  const endsAt = endDate === null ? null : toInstant(endDate, end);

  if (endsAt === null || endsAt <= startsAt) return { startsAt, endsAt: null, kind };
  return { startsAt, endsAt, kind };
}

// The first candidate that VALIDATES, not the first that matches. See RANGE above.
function firstValidRange(normalized: string): { start: WallClock; end: WallClock } | null {
  for (const match of normalized.matchAll(RANGE)) {
    const start = toWallClock(match[1], match[2]);
    const end = toWallClock(match[3], match[4]);
    if (start !== null && end !== null) return { start, end };
  }
  return null;
}

function firstValidMarkedStart(normalized: string): WallClock | null {
  for (const match of normalized.matchAll(MARKED_START)) {
    const start = toWallClock(match[1], match[2]);
    if (start !== null) return start;
  }
  return null;
}

// Extract the serving window and convert it to UTC instants, or null when the
// caption states no time.
//
// Expects normalized text — `normalizeCaption` output, which is NFC. `date` is a
// Stockholm calendar date ("yyyy-MM-dd"), normally from `extractDate`.
//
// PRECEDENCE: explicit range → lunchtid → marked start. Ordered by how complete a
// window the caption gives, and the first two are the pair worth arguing about:
//
//   "Lunchtid! 12-15 på Heden" must produce 12:00–15:00, not 11:00–14:00.
//
// An explicit range is what the truck SAID; `lunchtid` is what this module INFERS
// when they did not say. Preferring the statement over the inference is the phase
// plan's own recurring principle — "guards constrain what the system infers, never
// what it was told" (#5) — and it is also why the range keeps `kind: 'range'` and
// scores 1.0 while lunchtid scores 0.85.
//
// A marked start comes last because it gives no end at all.
//
// NULL RATHER THAN A FABRICATED WINDOW. A caption with no time is the ordinary case,
// not a failure, and the locations service already owns the fallback expiry. Guessing
// a window here would put a truck on the map for hours it never claimed.
//
// KNOWN LIMITS, each costing a missed window rather than a wrong one — the module
// stays quiet instead of inventing:
//
//   "11 till 14"     "till" as a range separator. Ordinary Swedish, and the natural
//                    next addition if real captions show it; left out because the
//                    issue enumerates the dash forms and vocabulary added without
//                    captions to check against is what this phase keeps paying for.
//   "öppnar 11"      a start announced by a verb rather than `kl`/`klockan`/`från`.
//   "11-"            a dangling range. Reads as a start with an open end, but the
//                    trailing dash is also how captions punctuate, so it is not
//                    self-identifying the way a full range is.
//   "kvällstid"      other named windows. `lunchtid` is the only one the plan fixes
//                    a definition for, and inventing the others is guesswork.
//   "2026-11-14"     an ISO date in a caption offers "11-14" to the range matcher
//                    once the year is rejected. `normalizeCaption` never produces
//                    one and a truck has no reason to write one, so the digit
//                    guards are not extended to the dash for it.
//
// ⚠ ONE LIMIT IS NOT THIS MODULE'S TO FIX, AND #67 SHOULD KNOW ABOUT IT. A caption
// naming two days with two windows pairs them wrongly, because the date and the time
// are extracted INDEPENDENTLY and each takes its own first match:
//
//   "Heden 11-14, imorgon Lindholmen 17-20"
//     extractDate → tomorrow   (the only date word in the caption is "imorgon")
//     extractTime → 11-14      (the first range)
//     result      → tomorrow 11-14, a pairing neither half of the caption states
//
// Neither function can see the mistake on its own: each returns the correct answer
// to the question it was asked. Fixing it means segmenting the caption into clauses
// and extracting a (date, time, location) triple per clause, which is a change to
// how the pipeline is composed rather than to any extractor — so it belongs to
// `parseCaption` (#67), alongside the leading-cancellation-tag case `date.ts`
// records for #80. Both are the same shape: a per-caption answer where the caption
// contains more than one claim.
//
// Bounded meanwhile by `confidence` and `expires_at`, like every wrong window here.
export function extractTime(normalized: string, date: string): ExtractedTime | null {
  const range = firstValidRange(normalized);
  if (range !== null) return toWindow(date, range.start, range.end, "range");

  if (LUNCHTID.test(normalized)) {
    return toWindow(date, LUNCHTID_START, LUNCHTID_END, "lunchtid");
  }

  const start = firstValidMarkedStart(normalized);
  if (start !== null) return toWindow(date, start, null, "range");

  return null;
}
