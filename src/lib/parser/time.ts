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
//
// ⚠ `start` WIDENS THE TYPE #58 SPECIFIED, which gave `'range' | 'lunchtid'` only.
// Deliberate, and the reason is a scoring bug rather than tidiness: a marked start
// ("Heden kl 11") was tagged `range`, so the matrix would score a caption giving
// only an opening time at 1.0 — above `lunchtid`, which gives a complete window.
// That is the opposite of the ordering the matrix intends.
//
// `endsAt === null` CANNOT be used to tell them apart instead, which is the obvious
// alternative and does not work: a range whose end falls in the spring-forward gap
// also has its end dropped, so the two are identical in every field but this one
// (PR #84 review).
//
// Nothing consumes `kind` yet — #66 is unwritten — so widening it now costs nothing
// and removes a defect that would otherwise be introduced there and blamed on the
// matrix. The intended mapping is `range` 1.0, `lunchtid` 0.85, and `start` no
// higher than `lunchtid`, since it carries strictly less information than either.
export type TimeKind = "range" | "lunchtid" | "start";

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
//
// `till` joins them, because "11 till 14" is the same range said in words and is
// ordinary Swedish rather than a variant spelling. It was listed as a known limit for
// one round, and a sweep of realistic captions showed the cost is not a missed window
// but a WRONG one: "Vi kör från 11 till 14" matched no range, `MARKED_START` picked
// up "från 11", and the caption returned a confident start with the stated 14:00
// close discarded (PR #84 r2).
//
// ⚠ WHAT THE `\s+` ACTUALLY DOES, stated precisely because the first version of this
// comment claimed more. It is NOT what stops "tillbaka" joining two numbers — that is
// `CLOCK` requiring a digit immediately after the separator, and "11 tillbaka 14" is
// rejected with `\s*` just as well. The spacing decides exactly one thing: the
// run-together form "11till14", which is not how anyone writes a range and is
// therefore not accepted as one. Both facts are pinned by test, and the distinction
// surfaced only because a mutation that relaxed this survived (PR #84 r2).
const RANGE_SEPARATOR = "(?:\\s*[-–—]\\s*|\\s+till\\s+)";

// An optional `kl` before the SECOND time. "Öppet kl 11 - kl 14" repeats the marker,
// which is ordinary, and without this the range stopped at the dash and degraded to
// the same silent start-only as above. A marker before the FIRST time needs no
// handling — it simply sits outside the match.
const REPEATED_MARKER = "(?:(?:kl|klockan)\\.?\\s*)?";

// DIGIT-ADJACENCY GUARDS, not word guards. A time is bounded by things that are not
// part of a number: these stop "61" being read out of the house number in
// "Nordostpassagen 61-63" and stop a partial match leaving a stray fragment.
// `\p{L}` is deliberately NOT excluded — "kl11-14" and "Lunch 11-14" both need the
// digits to be reachable.
//
// ⚠ THEY MUST REJECT A SEPARATOR ONLY WHEN A DIGIT FOLLOWS IT, and the first version
// rejected the separator outright. That made an ordinary full stop part of the
// number, so a time at the end of a sentence matched nothing at all:
//
//   "Öppet 11-14. Välkomna!"    → null
//   "Vi står på Heden 11-14."   → null
//   "Öppet kl 11-14. Välkomna"  → worse: the range failed, `kl 11` was picked up as
//                                 a marked start, and the stated 14:00 close was
//                                 silently dropped
//
// A trailing period is how Swedish sentences end, so this was not an edge case — it
// was the common shape, and 47 tests missed it because not one of them put
// punctuation after a time (PR #84 review).
//
// `[.:]?\d` keeps every rejection the strict form bought: "11-14.5" still fails
// (`.` then a digit), and "89-119" still fails (the second clock matches "11" and is
// followed by "9"). What it no longer does is treat "." as a digit.
const NOT_IN_NUMBER_BEFORE = "(?<!\\d[.:]?)";
const NOT_IN_NUMBER_AFTER = "(?![.:]?\\d)";

// Units that follow a NUMBER RANGE and prove it was never a clock time. A price, a
// head count, a portion count — captions are full of them, and every one otherwise
// becomes a serving window.
//
// ⚠ THE MODULE'S ORIGINAL CLAIM THAT A RANGE IS SELF-IDENTIFYING WAS FALSE. It said
// two valid hours joined by a dash are a shape "prose numbers essentially never
// form"; they form it constantly, and the existing fixtures only passed because
// their numbers happened to exceed 23:
//
//   "Burgare 10-20 kr, öppet 11-14"            → 08:00–18:00
//   "Vi har 5 - 10 platser kvar, öppet 11-14"  → 03:00–08:00
//   "Meny 2-3 rätter, Heden 11-14"             → 00:00–01:00
//
// WHY A DENYLIST IS THE SAFE DIRECTION HERE, when `negation.ts` argues the opposite.
// There, a gap in a denylist DELETES a location. Here, a gap leaves the status quo —
// the candidate is taken exactly as it is today — while a hit removes a fabricated
// window and lets the scan continue to the next candidate. The guard is therefore
// MONOTONE: it can only ever turn a wrong window into a right one or into none. The
// single way it could cost something is if a real time were followed by one of these
// words, and none of them can follow a clock time in Swedish.
//
// `min` is deliberately absent despite meaning "minute": it is also the possessive
// "my", which is an ordinary word to find after anything.
const TRAILING_UNITS = [
  "kr",
  "kronor",
  ":-",
  "st",
  "styck",
  "kg",
  "platser",
  "personer",
  "rätter",
  "sorter",
  "sorters",
  "minuter",
  "grader",
  "år",
] as const;

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
  `${NOT_IN_NUMBER_BEFORE}${CLOCK}${RANGE_SEPARATOR}${REPEATED_MARKER}${CLOCK}${NOT_IN_NUMBER_AFTER}`,
  "giu",
);

// "mellan 11 och 14" — the other ordinary way Swedish states a range.
//
// KEPT AS ITS OWN PATTERN rather than adding `och` to `RANGE_SEPARATOR`, and that is
// the point of the separation: a bare "och" between two numbers is NOT a range.
// "Vi har 11 och 14 sorters korv" would become a serving window. `och` only joins a
// range when `mellan` announced one, so the prefix is required and the two forms
// cannot be collapsed into one separator list.
const MELLAN_RANGE = new RegExp(
  `${BEFORE_WORD}mellan\\s+${CLOCK}\\s+och\\s+${CLOCK}${NOT_IN_NUMBER_AFTER}`,
  "giu",
);

// Words that mark a range as being about TIME rather than about money or quantity.
//
// ⚠ THIS IS A PREFERENCE, NOT A FILTER, and that distinction is what makes it safe.
// It never removes a candidate; it only decides which of several valid ones wins. If
// no candidate is preceded by one of these, behaviour is exactly what it was — first
// valid wins — so the rule cannot make any caption worse than it already was.
//
// It exists because `TRAILING_UNITS` only catches a price that names its unit, and
// the sweep showed the unmarked form is just as common: "Burgare 10-20, öppet 11-14"
// has a comma after the price, so nothing trailing identifies it, and the fabricated
// 08:00–18:00 window won on position alone. A range introduced by "öppet" is
// overwhelmingly more likely to be the serving window than one that is not.
const TIME_CONTEXT = [
  "öppet",
  "öppnar",
  "öppna",
  "öppettider",
  "tider",
  "tid",
  "kl",
  "klockan",
  "serverar",
  "säljer",
  "står",
  "kör",
  "lunch",
  "lunchen",
  "middag",
  "frukost",
  "fika",
] as const;

// The candidate is introduced by a time word, allowing the punctuation and spacing
// that normally sits between: "öppet 11-14", "Tider: 11-14", "öppet, 11-14".
const PRECEDED_BY_TIME_CONTEXT = new RegExp(
  `(?:${TIME_CONTEXT.join("|")})${AFTER_WORD}[\\s:,.\\-–—]{0,3}$`,
  "iu",
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

// A unit immediately after the range, allowing the space that normally precedes it.
const TRAILING_UNIT = new RegExp(`^\\s*(?:${TRAILING_UNITS.join("|")})${AFTER_WORD}`, "iu");

// Every range-shaped candidate from both patterns, in the order they appear in the
// caption. Two patterns rather than one alternation because the group numbering has
// to stay stable, and because `mellan … och` is a different construction rather than
// another separator — see MELLAN_RANGE.
function rangeCandidates(normalized: string): Array<{ index: number; length: number; groups: RegExpMatchArray }> {
  const found = [
    ...normalized.matchAll(RANGE),
    ...normalized.matchAll(MELLAN_RANGE),
  ].map((match) => ({ index: match.index, length: match[0].length, groups: match }));

  return found.sort((a, b) => a.index - b.index);
}

// The first candidate that VALIDATES — and, among those, the first INTRODUCED BY A
// TIME WORD if there is one. See TIME_CONTEXT for why the preference is separate
// from the validation.
//
// Validation skips a candidate rather than rejecting the caption, which is what lets
// the scan reach a real time further along: the hours must be in range, and the range
// must not be followed by a unit that proves it was a price or a count.
function firstValidRange(normalized: string): { start: WallClock; end: WallClock } | null {
  const valid: Array<{ start: WallClock; end: WallClock; introduced: boolean }> = [];

  for (const candidate of rangeCandidates(normalized)) {
    const start = toWallClock(candidate.groups[1], candidate.groups[2]);
    const end = toWallClock(candidate.groups[3], candidate.groups[4]);
    if (start === null || end === null) continue;
    if (TRAILING_UNIT.test(normalized.slice(candidate.index + candidate.length))) continue;

    valid.push({
      start,
      end,
      introduced: PRECEDED_BY_TIME_CONTEXT.test(normalized.slice(0, candidate.index)),
    });
  }

  return valid.find((candidate) => candidate.introduced) ?? valid[0] ?? null;
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
//   "öppnar 11"      a start announced by a verb rather than `kl`/`klockan`/`från`.
//   "elva till fjorton"
//                    times spelled as words — tracked as #85. Genuinely a different
//                    problem: it needs a number-word table, not a separator, and it
//                    is deliberately unscheduled until real captions show the form
//                    occurs. Returns null, so the cost is a missed window rather
//                    than a wrong one.
//   "Burgare 10-20, öppet 11-14"
//                    RESOLVED by the TIME_CONTEXT preference, but only because a time
//                    word introduces the real window. A price range with a comma
//                    after it and no time word anywhere still wins on position.
//
// ⚠ THE SHAPE TO WATCH, rather than any single missing form: when a range form is not
// recognised, `MARKED_START` can still match the opening time, and the result is a
// confident-looking start with the stated close DISCARDED — worse than returning
// nothing, because nothing signals the loss. Three separate causes produced it (a
// trailing full stop, `till`, a repeated `kl`) and all three are fixed, but the shape
// is structural: it recurs for any range form added later and not recognised here.
//
// A blunt guard for it was considered and rejected: refusing a marked start whenever
// another clock-shaped number appears in the same clause also kills legitimate cases
// ("Öppet kl 11, 14 sorters korv"), trading a silent truncation for a silent miss.
// The real defence is that an unrecognised range form is a MISSING SEPARATOR, and the
// fix is to recognise it — which is why `till` and `mellan … och` are now in rather
// than listed here.
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
  if (start !== null) return toWindow(date, start, null, "start");

  return null;
}
