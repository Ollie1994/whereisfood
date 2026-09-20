import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { deleteLocations, findOverlapping, insertLocation } from "@/lib/db/locations";
import { isParseable, updateParsingStatus } from "@/lib/db/posts";
import { updateLastKnownPosition } from "@/lib/db/trucks";
import { geocode } from "@/lib/geocoding";
import { addCalendarDays } from "@/lib/parser/date";
import { postSourceToLane, sourceConfidence } from "@/lib/sources";
// `NewLocation` is deliberately not imported: the insert below is an object literal
// passed straight to `insertLocation`, so TypeScript checks it against that
// parameter's type directly. A local annotation would be a second place for the shape
// to be stated, and the acceptance criterion ("every NOT NULL column is set") is
// enforced either way — by the required fields on `NewLocation` itself.
import type { Location, ParseResult, Post, ResolvedPlace } from "@/lib/types";

// The impure half of the phase: a `ParseResult` becomes a persisted `locations` row,
// or it does not. Business logic only — no HTTP knowledge, and every database touch
// goes through `db/`.
//
// Kept out of `ingestion.ts` deliberately: that file already owns HMAC verification,
// freshness and replay, and none of those have anything to say about where a truck is.
//
// ⚠ THIS MODULE'S FAILURES ARE SILENT BY CONSTRUCTION, WHICH IS WHY IT IS SHAPED THE
// WAY IT IS. A wrong override decision deletes or replaces a truck's pin and nothing
// throws, no test fails, and no log line is obviously wrong — the map is just wrong.
// Across the five PRs merged this phase, `incomplete-guard` was the largest defect
// class by a wide margin (26 of 72 findings), and almost never as "a guard was
// missing": it was a guard that covered the case its author had in mind while missing
// its neighbour. The two structural answers used here, both borrowed from
// `confidence.ts` which has held all phase:
//
//   THE OVERRIDE MATRIX IS A `Record` KEYED ON BOTH LANES. Nine cells, written out.
//   A fourth lane fails the build rather than falling through a comparison.
//
//   "PRODUCE NO LOCATION" IS ONE NAMED EXIT keyed on an enumerated reason, not a
//   scatter of inline early-returns. Plan decision #9 imposed this before the code was
//   written, for a reason worth restating: it has five callers today and gains #102's
//   later. Named, #102 lands as one more key. Inlined, it would have landed as a
//   rewrite of this file — and #69 is the proof, since the cancellation branch grew
//   from a bare return into a window, a query, a matrix and a delete without any other
//   exit having to move.
//
//   THE CANCELLATION MATRIX IS A SECOND `Record`, side by side with the override one.
//   They differ on exactly the diagonal (`>=` against `>`), which reads like a typo
//   and is plan decision #6 — so the defence is that both tables are visible together,
//   each carrying its own reason.

// Every wall clock in this system is Stockholm; every stored instant is UTC.
const TIME_ZONE = "Europe/Stockholm";

// How to infer a live window when the caption stated no closing time.
//
//   from-start  the truck is there from `starts_at` — either a stated opening hour, or
//               a same-day caption whose start IS the post. The 8 h guess applies.
//   whole-day   the caption named a future day and no time at all. `starts_at` is a
//               midnight nobody announced, so the window is the day, not 8 h of it.
//
// Decided in `resolveStartsAt`, which is the one place that knows which it is.
type InferredWindow = "from-start" | "whole-day";

// The inferred-window fallback from plan decision #5, used only when the caption
// stated no closing time.
const FALLBACK_WINDOW_MS = 8 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Outcomes
// ---------------------------------------------------------------------------

// Why no `locations` row was written. An enumeration rather than a boolean because
// the reasons do NOT share a `parsing_status` — see `STATUS_ON_NO_LOCATION` — and
// because #70's wiring and #71's replay both need to tell a cancellation from a
// geocode outage without re-deriving it.
export type NoLocationReason =
  // The post must never be acted on. Today that is a stale-but-signed Mailgun
  // payload; after migration 0005 it is also a crosspost.
  | "unparseable-post"
  // A violated input contract — `posted_at` or `ParseResult.date` is not a date this
  // system can read (#95).
  | "invalid-date"
  // The caption named no place this parser recognises. Nothing to pin.
  | "no-place"
  // An address candidate that Nominatim could not resolve, or resolved outside
  // Gothenburg.
  | "geocode-failed"
  // The override matrix says an existing overlapping location outranks this one.
  | "outranked";

export type WriteOutcome =
  // `replaced` carries the ids of the overlapping locations this insert superseded,
  // which is what makes "did anything get deleted" assertable without re-querying.
  | { kind: "inserted"; location: Location; replaced: readonly string[] }
  // ⚠ A CANCELLATION IS ITS OWN OUTCOME AND NOT A `NoLocationReason`, WHICH DEVIATES
  // FROM THE LETTER OF PLAN DECISION #9 (#69). That decision listed the negation as
  // one of three callers of the "produce no location" exit, and it was one for as long
  // as the branch was #68's stub — a bare return.
  //
  // It is not one any more. The branch now resolves a window, queries, filters by the
  // cancellation matrix and DELETES; "no location was produced" describes what it did
  // not do rather than what it did. Folding it back in would put it in a table whose
  // whole job is mapping an outcome to a `parsing_status`, next to five reasons that
  // wrote nothing — and `deleted: []` (a cancellation matching nothing) would then be
  // indistinguishable from a post that never tried.
  //
  // Decision #9's actual requirement — that this not be three inline early-returns —
  // is unaffected: the exit still exists, still has five callers, and still gains
  // #102's as one more key.
  | { kind: "cancelled"; deleted: readonly string[] }
  | { kind: "no-location"; reason: NoLocationReason };

// ---------------------------------------------------------------------------
// The override matrix
// ---------------------------------------------------------------------------

type Lane = Location["source"];

// Incoming lane × existing lane → what happens to the incoming location.
//
// ⚠ NINE CELLS WRITTEN OUT, AND THE ALTERNATIVE IS NOT EQUIVALENT. The documented
// rule is two sentences — "manual always overrides; higher source confidence replaces
// lower; same confidence discards the incoming" — and the obvious implementation is
// `incoming === "manual" || sourceConfidence(incoming) > sourceConfidence(existing)`.
// That is not the same function. `manual` vs `manual` is `1.0 > 1.0`, which is false,
// so the arithmetic form DISCARDS it while the first sentence says it replaces. A
// truck owner correcting their own dashboard entry is the most ordinary edit there
// is, and it would have silently done nothing.
//
// The rule is therefore not derivable from the numbers, which is exactly why it is a
// table: every cell is a decision someone made, visible, and a fourth lane cannot
// compile until it is placed. `locations.test.ts` asserts the table against both
// sentences, so the prose and the cells cannot drift apart either.
//
// ⚠ NEGATIONS USE A DIFFERENT TABLE, AND DELIBERATELY SO (plan decision #6). A
// cancellation compares `>=`, so the three diagonal cells invert: a truck that posted
// via Make.com must be able to retract via Make.com. See `CANCELLATION` below.
//
// The two are NOT unified behind a flag or a comparison parameter, and #69 kept it
// that way on landing. A `strict: boolean` would make the asymmetry a call-site
// argument — the one place nobody reads twice — and the asymmetry is the thing most
// likely to be "corrected" by someone who thinks the `>=` is a typo. Two tables, side
// by side, each carrying the argument for its own diagonal, is the defence.
// ⚠ ONE DIMENSION, AND TWO OTHERS ARE MISSING — both filed, neither fixed here,
// because this table is CLAUDE.md's documented rule and changing it unilaterally is
// the re-litigation CLAUDE.md forbids (PR #107 review r1/r2).
//
//   RECENCY (#110). Same lane always discards, so a truck's 15:00 "now at Lindholmen"
//   is outranked by its own 11:00 post and the map stays wrong until 19:00.
//
//   PRECISION (#111). The comparison reads `source_confidence` ONLY, never the
//   product the map actually filters on. So an hourless "Lindholmen imorgon"
//   (0.6 × 0.85 = 0.51) replaces a precise emailed "Järntorget 11-14"
//   (1.0 × 0.55 = 0.55) — LOWER combined confidence winning on lane alone.
//
// ⚠ BOTH BECAME REACHABLE THROUGH CORRECTIONS, WHICH IS THE PART WORTH KNOWING. H4's
// `expires_at` fix and r1's whole-day window each widened what `findOverlapping`
// SEES. Neither created these conflicts; both were previously invisible, resolved by
// leaving two contradictory pins live for one truck at one moment. Seeing a conflict
// and deciding it badly is strictly better than not seeing it — but it is not done.
const OVERRIDE: Record<Lane, Record<Lane, "replace" | "discard">> = {
  // A human typed this in the dashboard. It outranks everything, including an earlier
  // manual entry — that case is a correction, not a competing claim.
  manual: { manual: "replace", webhook: "replace", email: "replace" },
  // A post from the truck's own account beats an email (whose HMAC authenticates the
  // relay, not the content) and loses to a human. Webhook vs webhook keeps the first:
  // two automated claims disagreeing is what `>` exists to stop flip-flopping.
  webhook: { manual: "discard", webhook: "discard", email: "replace" },
  // The lowest-trust lane replaces nothing, including another email. CLAUDE.md's
  // reasoning is structural: nothing in Mailgun's signature proves the truck wrote it.
  email: { manual: "discard", webhook: "discard", email: "discard" },
};

// ⚠ THE INCOMING LOCATION MUST BEAT *EVERY* OVERLAPPING ROW, NOT MERELY ONE.
//
// `findOverlapping` returns a set, and it is genuinely plural: an incoming 12:00–14:00
// window overlaps both an existing 11:00–13:00 and an existing 13:30–15:00, neither of
// which overlaps the other. So "apply the matrix" needs a rule for a set, and the
// issue states it only for a pair.
//
// Beating SOME of them and inserting anyway is the wrong answer, and not marginally:
// a webhook facing an existing email and an existing manual would delete the email,
// insert itself, and leave a webhook pin and a manual pin live in the same window —
// two conflicting answers to "where is this truck", created by the very mechanism
// that exists to prevent them. Discarding leaves the pre-existing pair alone, which
// is a state this function did not create and one a later manual post resolves.
//
// So: unanimous replace, or discard. The `every` is the whole rule.
function overridesAll(incoming: Lane, existing: readonly Location[]): boolean {
  return existing.every((row) => OVERRIDE[incoming][row.source] === "replace");
}

// The cancellation matrix (#69). Cancelling lane × existing lane.
//
// ⚠ IDENTICAL TO `OVERRIDE` EXCEPT ON THE DIAGONAL, AND THE DIFFERENCE IS THE WHOLE
// POINT (plan decision #6). Locations compare `>`; cancellations compare `>=`:
//
//   location:  new.source_confidence >  existing.source_confidence → replace
//   negation:  new.source_confidence >= existing.source_confidence → cancel
//
// ⚠ IT READS LIKE A TYPO AND SOMEONE WILL "FIX" IT. Under `>`, a truck that posts its
// location through Make.com and then cancels through Make.com compares 0.85 against
// 0.85, the cancellation is DISCARDED, and **a truck can never retract a post through
// the lane it posted from** — silently, on the most common cancellation path there is.
//
// The reason `>` does not apply: it exists to stop two competing location CLAIMS
// flip-flopping — two webhooks disagreeing about position, keep the first. A
// cancellation is not a competing claim; it is the same source retracting its own
// earlier statement. Arbitration rules for claims should not govern retractions, or
// the system accepts a statement it will never allow you to take back.
//
// ⚠ AND THE MATRIX STILL APPLIES AT ALL, WHICH IS THE SECURITY HALF. An unmatched
// negation would let a forged email DELETE any truck's manually-posted location — a
// denial of service on truck visibility through the LOWEST-confidence lane. CLAUDE.md
// is explicit that Mailgun's HMAC covers only `timestamp + token`, authenticating the
// relay and never the content, so nothing proves an email came from the truck. Email
// (0.55) therefore cannot cancel webhook (0.85) or manual (1.0).
//
// A negation's `parser_confidence` is 0.0 (`scoreConfidence` short-circuits on it), so
// the comparison is deliberately on `source_confidence` alone — the lane is the only
// thing that carries authority here, and the 0.0 must not interfere.
//
// Residual, accepted by decision #6: a forged email can cancel a genuine EMAIL-sourced
// location. Identical in kind to the forged-creation exposure that already exists,
// bounded by the replay index and the 15-minute window, and closed properly by Phase
// 7's Mailgun IP allowlist.
const CANCELLATION: Record<Lane, Record<Lane, "cancel" | "keep">> = {
  manual: { manual: "cancel", webhook: "cancel", email: "cancel" },
  // The diagonal cell that `>` would get wrong, and the reason this table exists.
  webhook: { manual: "keep", webhook: "cancel", email: "cancel" },
  // Still cannot touch a webhook or a manual pin — the #1 security property.
  email: { manual: "keep", webhook: "keep", email: "cancel" },
};

// ⚠ PER-ROW, WHERE THE INSERT PATH IS ALL-OR-NOTHING, AND THAT ASYMMETRY IS CORRECT
// RATHER THAN AN INCONSISTENCY. `overridesAll` demands unanimity because inserting
// while losing to even one existing row would leave two conflicting pins live — it
// would CREATE the state the matrix exists to prevent. A cancellation creates nothing.
// Deleting the rows it is entitled to delete and leaving the rest produces no
// conflict; it simply cancels less than the whole window, which is exactly what a
// lane-limited retraction should do.
function cancellableIds(cancelling: Lane, existing: readonly Location[]): string[] {
  return existing
    .filter((row) => CANCELLATION[cancelling][row.source] === "cancel")
    .map((row) => row.id);
}

// ---------------------------------------------------------------------------
// The single "no location" exit (plan decision #9)
// ---------------------------------------------------------------------------

// What each reason records on the post. `null` means "leave the status alone", which
// is a third answer and not a synonym for either terminal state.
//
// ⚠ THE REASONS DO NOT SHARE A STATUS, and that is the argument for the table. Three
// distinct answers across six reasons is not something a single early-return per site
// keeps straight, and getting one wrong is invisible: the post simply sits in the
// wrong bucket, and the buckets are what #71's replay and any future failure sweep
// select on.
const STATUS_ON_NO_LOCATION: Record<NoLocationReason, Post["parsing_status"] | null> = {
  // LEAVE IT. The post already carries `'skipped'` (or, after 0005, `'duplicate'`) and
  // that value is load-bearing for monitoring — CLAUDE.md wants "are we skipping
  // genuine truck emails?" to stay answerable. Overwriting it with `'parsed'` here
  // would destroy the only record of why the post was never acted on.
  "unparseable-post": null,
  // A violated input contract is an abnormal outcome and belongs in the bucket that
  // gets looked at. It is not re-parseable without fixing the caller, which is the
  // difference between this and an ordinary retry — but `'parsed'` would hide it.
  "invalid-date": "failed",
  // ⚠ `'parsed'` AND NOT `'failed'`, AND THIS IS A JUDGEMENT THE ISSUE DOES NOT MAKE.
  // "Vi har nybakat bröd idag!" is a caption with no location in it. The parser did
  // its job and the honest answer is that there is no pin — nothing failed. Filing it
  // under `'failed'` would fill the retry bucket with posts that can never succeed and
  // make the geocode-outage signal unreadable, which is the one thing that bucket is
  // for (plan decision #7). Leaving it `'pending'` is worse still: a sweep would
  // retry it forever.
  "no-place": "parsed",
  // Genuinely retryable, and the reason plan decision #7 built a replay path at all.
  "geocode-failed": "failed",
  // Parsing succeeded completely; the matrix chose to keep the existing pin. Nothing
  // about this post needs revisiting.
  outranked: "parsed",
};

async function noLocation(post: Post, reason: NoLocationReason): Promise<WriteOutcome> {
  const status = STATUS_ON_NO_LOCATION[reason];
  if (status !== null) await updateParsingStatus(post.id, status);

  return { kind: "no-location", reason };
}

// ---------------------------------------------------------------------------
// parsedAt — one derivation, two callers (plan hazard H3)
// ---------------------------------------------------------------------------

// The Stockholm calendar date a post's caption must be read against.
//
// ⚠ EXPORTED SO `scripts/reparse.mjs` (#71) CANNOT DERIVE IT DIFFERENTLY. Hazard H3 is
// that replaying a three-day-old post with today's date makes "idag" mean today,
// minting a fresh pin from a stale caption — the same stale-pin hazard used to reject
// the cron-retry option. One exported function is the structural version of "the live
// path and the script must agree"; two correct-looking derivations in two files is the
// version that drifts.
//
// Equivalent to H3's `format(toZonedTime(post.posted_at, TZ), "yyyy-MM-dd")`, written
// as the single-call form date-fns-tz provides for exactly this.
//
// Returns null on a `posted_at` that is not a readable instant. Not reachable from
// either real caller — the column is `timestamptz NOT NULL`, so Postgres has already
// validated it — but #95 is specifically about the value arriving from somewhere that
// has not, and a function that throws would make that a 500 instead of a `'failed'`.
//
// ⚠ CALLERS MUST PARSE AGAINST THIS VALUE, AND `writeLocationFromPost` CANNOT CHECK
// THAT THEY DID. It receives a `ParseResult` that already exists, so a caller that
// parsed against some other date hands over a result this module has no way to
// recognise as mismatched. `resolveStartsAt` depends on the agreement directly: its
// "is this caption about the day it was posted" branch compares `ParseResult.date`
// against the value derived here, and a caller using a different one would push an
// ordinary same-day caption down the future-date path. Exporting the single
// derivation is the whole defence; there is no second one.
export function parsedAtFor(post: Post): string | null {
  if (Number.isNaN(Date.parse(post.posted_at))) return null;

  return formatInTimeZone(post.posted_at, TIME_ZONE, "yyyy-MM-dd");
}

// ---------------------------------------------------------------------------
// Coordinates
// ---------------------------------------------------------------------------

interface ResolvedCoordinates {
  latitude: number;
  longitude: number;
  // The text the location was resolved FROM — `locations.address_raw`.
  addressRaw: string;
  // The canonical string — `locations.address_geocoded`.
  addressGeocoded: string | null;
}

// ⚠ A DICTIONARY HIT MAKES NO NETWORK CALL, AND THAT IS THE ENTIRE DESIGN RATHER THAN
// an optimisation. The dictionary carries reviewed coordinates; routing that certainty
// back through a fallible service would add a failure mode and buy nothing, and a
// geocode failure costs the whole `locations` row.
//
// The `null` place is handled by the caller and never reaches here, so this switch has
// two real cases. The `never` assignment is what makes a third one a compile error —
// `noImplicitReturns` is off in this project, so without it an added `ResolvedPlace`
// variant would fall out of the bottom returning `undefined`, which types as
// `ResolvedCoordinates | null` and reads as a failed geocode.
async function resolveCoordinates(
  place: NonNullable<ResolvedPlace>,
): Promise<ResolvedCoordinates | null> {
  switch (place.kind) {
    case "dictionary":
      return {
        latitude: place.match.entry.lat,
        longitude: place.match.entry.lng,
        // The caption substring, spelling and casing intact — "jarntorget",
        // "Nordstans". `extractLocation` returns it precisely so this module does not
        // have to redo the match to recover it, and `entry.match[0]` is NOT it: that
        // is the alias we recognised, not the text the truck wrote.
        addressRaw: place.match.matched,
        addressGeocoded: place.match.entry.address,
      };

    case "fallback": {
      const hit = await geocode(place.address);
      if (hit === null) return null;

      return {
        latitude: hit.lat,
        longitude: hit.lng,
        addressRaw: place.address,
        // ⚠ NULL ON A CACHE HIT, and that is #103 rather than a bug here.
        // `geocoding_cache` has no `display_name` column, so the same address yields a
        // canonical string the first time it is geocoded and null every time after.
        // Not load-bearing — the pin comes from the coordinates — and fixing it needs
        // a migration this issue does not own.
        addressGeocoded: hit.displayName,
      };
    }

    default: {
      const unreachable: never = place;
      return unreachable;
    }
  }
}

// ---------------------------------------------------------------------------
// The window
// ---------------------------------------------------------------------------

// When the truck says it is there.
//
// ⚠ THE NO-TIME CASE IS TWO CASES, and collapsing them breaks one of them. A caption
// naming a place but no time still needs a `starts_at` — the column is NOT NULL — and
// the right answer depends on whether the caption is about today:
//
//   "Vi står vid Järntorget"           posted 11:00 → starts 11:00. The truck is
//                                      there NOW; the post IS the start.
//   "Vi står vid Järntorget imorgon"   posted 11:00 → starts tomorrow 00:00. Using
//                                      `posted_at` would pin it to today, which the
//                                      caption explicitly denies.
//
// The branch is `date === parsedAt`, i.e. "the caption is about the day it was posted",
// which is both the common case and the one where the two answers coincide.
//
// `extractDate` never resolves backwards, so a date BEFORE `parsedAt` is unreachable
// from either caller; it would land in the day-start branch, which is harmless.
//
// ⚠ RETURNS THE WINDOW KIND ALONGSIDE THE INSTANT, because the same branch decides
// both and two copies of the condition drift. The 8 h guess means "a truck is at a
// spot about eight hours from when it says it is there" — true when the post IS the
// start, and meaningless anchored to a midnight nobody announced. See
// `computeExpiresAt`.
function resolveStartsAt(
  post: Post,
  parseResult: ParseResult,
  parsedAt: string,
): { startsAt: string; window: InferredWindow } {
  // Any stated time — a full range, a lunchtid, or a bare opening hour — anchors the
  // window to something the truck actually said.
  if (parseResult.time !== null) {
    return { startsAt: parseResult.time.startsAt, window: "from-start" };
  }

  // Normalised through `Date` rather than passed through: `posted_at` comes back from
  // Postgres as "+00:00" and every other instant in this module is `toISOString()`'s
  // ".000Z". Same instant, different text — converting once here means nothing
  // downstream compares the two forms as strings.
  if (parseResult.date === parsedAt) {
    return { startsAt: new Date(post.posted_at).toISOString(), window: "from-start" };
  }

  return {
    startsAt: fromZonedTime(`${parseResult.date}T00:00:00`, TIME_ZONE).toISOString(),
    window: "whole-day",
  };
}

// The instant a Stockholm calendar day ends — equivalently, the instant the next one
// begins. Exclusive: every instant belonging to `date` is strictly less than this.
//
// ⚠ ONE DEFINITION, TWO CONSUMERS (the plan's M6 rule). `computeExpiresAt` caps an
// inferred window with it and `cancellationWindow` (#69) bounds a full-day retraction
// with it, and those two MUST agree — a cancellation whose day ended a second before
// the location's did would leave a sliver of pin alive that nothing could then remove.
// Two copies of a boundary is precisely how that sliver appears.
//
// ⚠ NEXT MIDNIGHT RATHER THAN `23:59:59`, which was a live defect and not a rounding
// preference (PR #107 r1): `starts_at` carries milliseconds, so a caption posted at
// 23:59:59.500 expired 500 ms before it began. Every instant within the day is
// strictly less than next midnight at any precision, so no sub-second gap can exist.
//
// DST-safe by construction: built with `addCalendarDays` + `fromZonedTime`, never by
// adding 24 h. A Swedish day is 23 or 25 hours twice a year, and the transition is at
// 03:00 local so midnight itself is never doubled or missing.
function stockholmDayEnd(date: string): string {
  const nextDay = addCalendarDays(date, 1);
  // `date` is a validated calendar date by contract — `writeLocationFromPost` rejects
  // it as `invalid-date` before either caller is reached. Stated as a thrown
  // precondition rather than left implicit: the previous `${date}T23:59:59` form
  // produced an Invalid Date, then `NaN` through `Math.min`, then a `RangeError` from
  // `toISOString` — a failure three steps from its cause.
  if (nextDay === null) {
    throw new Error(`stockholmDayEnd: unreadable date ${date}`);
  }

  return fromZonedTime(`${nextDay}T00:00:00`, TIME_ZONE).toISOString();
}

// When the location stops being live — `expires_at`, which is also the effective end
// the overlap query compares against (plan hazard H4).
//
// Plan decision #5, both halves:
//
//   ends_at extracted → expires_at = ends_at                       (NOT capped)
//   no ends_at        → min(starts_at + 8h, midnight of that day)
//
// ⚠ AN EXPLICIT END IS NEVER CAPPED. "Vi står vid Järntorget 22-01" is an ordinary
// late-night pattern here and expires at 01:00. The cap exists to bound what the
// system INFERS, never what it was told — the same principle that makes negations go
// through the priority matrix and fuzzy geocodes get penalised rather than discarded.
//
// ⚠ THE FALLBACK IS `starts_at + 8h`, AND THE PLAN SAYS `posted_at + 8h`. The two are
// the same value in every case the plan had in mind and differ in one it did not, so
// this is a deliberate reading of decision #5's intent over its letter — flagged here
// and in the PR rather than changed quietly.
//
// Decision #5(a) settles that the CAP is midnight of `starts_at`'s day and not
// `posted_at`'s, for a stated reason: otherwise "imorgon lunch 11-14" expires tonight,
// before its own `starts_at`, and is never visible for a single second. That reasoning
// does not survive being applied only to the cap. Take "Vi står vid Heden imorgon" —
// a place, a future day, no time, which scores 0.6 and is an entirely ordinary caption:
//
//   posted_at + 8h   = tonight       ← the smaller term, so the cap never applies
//   starts_at + 8h   = tomorrow 08:00
//
// The literal rule produces a row that expired before it began, exactly the defect
// #5(a) was written to prevent, reached through the other term. `starts_at + 8h` is
// the same arithmetic wherever `starts_at` is `posted_at` — which is every same-day
// caption, so the live path's ordinary case is untouched — and is the only reading
// under which the rule cannot contradict itself.
//
// `date` is `starts_at`'s Stockholm day in all three shapes: `extractTime` builds its
// instants on it, and both `resolveStartsAt` fallbacks land on it by construction.
export function computeExpiresAt(
  startsAt: string,
  endsAt: string | null,
  date: string,
  window: InferredWindow = "from-start",
): string {
  if (endsAt !== null) return endsAt;

  // ⚠ THE BOUNDARY IS THE NEXT DAY'S MIDNIGHT, NOT `23:59:59` — and the one-second
  // difference was a live defect, not a rounding preference (PR #107 review r1).
  //
  // `starts_at` carries milliseconds: the webhook lane sets `posted_at` from
  // `new Date().toISOString()`, and a same-day no-time caption uses that instant
  // verbatim. A caption posted at 23:59:59.500 local therefore produced
  //
  //   starts_at  23:59:59.500
  //   dayEnd     23:59:59.000   ← the smaller value, so `min` picked it
  //
  // a row born 500 ms already expired, invisible for its entire life. VERIFIED before
  // this change, not reasoned about. It is the third instance this phase of the same
  // shape — `expires_at` landing before `starts_at` — after decision #5(a)'s and the
  // `posted_at + 8h` base, and the reason it survived a property test written
  // specifically to catch the class is that all five of that test's fixtures had
  // `.000` milliseconds.
  //
  // Next-midnight removes the hole rather than narrowing it: every instant within the
  // day is strictly less than it, at any precision, so no sub-second gap can exist.
  // "Never show past midnight" is satisfied exactly — the pin dies AT midnight.
  //
  // DST-safe via `addCalendarDays` + `fromZonedTime`, never by adding 24 h: a Swedish
  // day is 23 or 25 hours twice a year, and the transition is at 03:00 local so
  // midnight itself is never doubled or missing.
  const dayEnd = Date.parse(stockholmDayEnd(date));

  // ⚠ A CAPTION NAMING A FUTURE DAY AND NO TIME GETS THE WHOLE DAY, NOT EIGHT HOURS OF
  // IT (PR #107 review r1). The 8 h guess encodes "a truck is at a spot about eight
  // hours from when it says it is there", which is a statement about the POST — true
  // for "Vi står vid Järntorget", posted while standing there.
  //
  // Anchored to a future day it has no such meaning. `starts_at` is then 00:00, a time
  // nobody announced, so the window ran 00:00–08:00 local: the pin was live only
  // overnight and gone before anyone looked for lunch. "Vi står vid Järntorget
  // imorgon" is an ordinary caption and it was never visible during the hours it was
  // about — the same failure as expiring before `starts_at`, one step subtler because
  // the row does exist for eight hours.
  //
  // The honest reading of that caption is "sometime tomorrow", so the live window is
  // tomorrow. The cap is unchanged and still does the work it was written for; the
  // confidence score (0.6 × lane) is what signals that the hours are unknown.
  const inferredEnd =
    window === "whole-day" ? dayEnd : Date.parse(startsAt) + FALLBACK_WINDOW_MS;

  // Instants, not strings. `Math.min` over epoch milliseconds is the comparison that
  // is correct regardless of which format either side was written in.
  return new Date(Math.min(inferredEnd, dayEnd)).toISOString();
}

// ---------------------------------------------------------------------------
// The cancellation path (#69)
// ---------------------------------------------------------------------------

// What a cancellation supersedes: the range the caption stated, or the whole Stockholm
// day it named.
//
// ⚠ THE FULL-DAY FALLBACK IS THE POINT, NOT A SAFETY MARGIN (plan decision #1).
// "Inställt idag" must cancel EVERY location for that truck that day — a truck with a
// lunch slot and a dinner slot has cancelled both. Resolving it to a narrow window, or
// to the instant the post arrived, would cancel one of them or none, and the failure
// would be silent: the truck says it is closed and its dinner pin stays on the map.
//
// ⚠ THE OPPOSITE ERROR IS WORSE, AND IS WHY THE RANGE WINS WHEN THERE IS ONE.
// "Inställt 11-14 idag" cancels the lunch and must leave the dinner alone. That the
// range survives into `ParseResult` at all is a defect `parser/index.ts` had and
// fixed: its first version bailed on a negation with `time: null`, so a truck
// cancelling only its lunch slot would have fallen through to this full-day rule and
// lost its 17-20 pin as well.
function cancellationWindow(parseResult: ParseResult): { from: string; to: string } {
  const dayEnd = stockholmDayEnd(parseResult.date);

  if (parseResult.time === null) {
    return {
      from: fromZonedTime(`${parseResult.date}T00:00:00`, TIME_ZONE).toISOString(),
      to: dayEnd,
    };
  }

  return {
    from: parseResult.time.startsAt,
    // An opening time with no close — "Inställt från 14" — cancels to the end of the
    // day rather than to an arbitrary point. `endsAt` being null means the caption
    // stated no end, and for a retraction the honest reading of that is "from then on",
    // bounded by the day the caption named.
    to: parseResult.time.endsAt ?? dayEnd,
  };
}

// A cancellation DELETES the locations it supersedes and writes no row of its own
// (plan decision #1).
//
// ⚠ WHY NOT A TOMBSTONE, since the schema still has `is_negation` and the older docs
// described one. The active query is `is_negation = false AND expires_at > now()`, so
// a tombstone row is invisible to it BY CONSTRUCTION while the original row still
// matches — cancellation would appear to work for a client listening live and fail
// silently for anyone who refreshed or reconnected. The original has to be deleted
// either way, and once it is, the tombstone's only remaining job (telling the client)
// is already done by the DELETE event. The column stays for a possible Phase 5 manual
// "closed today" toggle.
async function cancelLocations(post: Post, parseResult: ParseResult): Promise<WriteOutcome> {
  const { from, to } = cancellationWindow(parseResult);
  const cancelling = postSourceToLane(post.source);

  const overlapping = await findOverlapping(post.truck_id, from, to);
  const deleted = cancellableIds(cancelling, overlapping);

  // ⚠ MATCHING NOTHING IS A SILENT NO-OP BY DESIGN, NOT AN ERROR. A truck cancelling a
  // day it had nothing scheduled for is ordinary — it may have posted the cancellation
  // before anything was ever parsed, or its pin may already have expired.
  // `deleteLocations` skips the round trip for an empty list.
  await deleteLocations(deleted);

  // ⚠ NO `last_known_*` UPDATE, AND CERTAINLY NO CLEARING OF IT. A cancellation says
  // where the truck will NOT be; it carries no position at all (`parseCaption`
  // suppresses `place` on a negation precisely so this path cannot read one). Nulling
  // the denormalized position would erase a working grey marker every time a truck
  // took a day off, which is the opposite of what that column is for.
  await updateParsingStatus(post.id, "parsed");

  return { kind: "cancelled", deleted };
}

// ---------------------------------------------------------------------------
// The write path
// ---------------------------------------------------------------------------

// Turn one parsed post into a `locations` row, or explain why it did not.
//
// ⚠ THE GUARD ORDER IS DELIBERATE, and one position in it is load-bearing for #69.
// The date checks run BEFORE the negation branch, so when #69 replaces that branch
// with the real delete path it inherits a validated `date` — the cancellation window
// is "the full Stockholm day of the extracted date" when no time was given, so an
// unreadable date there would mean a delete against a window built from garbage.
// Ordering it this way costs nothing now and removes a hazard from an issue that has
// not been written yet.
export async function writeLocationFromPost(
  post: Post,
  parseResult: ParseResult,
): Promise<WriteOutcome> {
  // FIRST, AND BEFORE ANYTHING ELSE READS THE PARSE RESULT. A stale-but-signed email
  // is kept and never acted on; this is the single line that enforces it.
  if (!isParseable(post.parsing_status)) return noLocation(post, "unparseable-post");

  const parsedAt = parsedAtFor(post);
  if (parsedAt === null) return noLocation(post, "invalid-date");

  // #95, validated at the derivation point — which decision #9 settles is here.
  //
  // `addCalendarDays` rather than a regex, and rather than a second date validator:
  // its round trip already rejects everything a hand-written check would try to
  // enumerate (February 31st, two-digit years, anything the shape test let through),
  // it is pure, and it is tested. `+ 0` days is the identity, so a non-null answer
  // means exactly "this is a calendar date I can read".
  //
  // Needed even though `parsedAt` above is well-formed by construction: `parseCaption`
  // is called by the CALLER, which may have passed it a different `parsedAt`, and
  // `extractDate` returns whatever it was given untouched on every non-match path.
  if (addCalendarDays(parseResult.date, 0) === null) {
    return noLocation(post, "invalid-date");
  }

  // The cancellation path (#69), which replaced #68's no-op stub here. It is placed
  // AFTER the date checks deliberately: the full-day window below is built from
  // `parseResult.date`, so a date this system cannot read must never reach a DELETE.
  if (parseResult.isNegation) return cancelLocations(post, parseResult);

  if (parseResult.place === null) return noLocation(post, "no-place");

  const resolved = await resolveCoordinates(parseResult.place);
  // ⚠ NOTHING IS WRITTEN AND `last_known_*` IS NOT TOUCHED. A failed geocode means we
  // could not read today's caption, not that we have forgotten where this truck has
  // ever been — nulling the denormalized position would erase a working grey marker
  // every time Nominatim had a bad minute.
  if (resolved === null) return noLocation(post, "geocode-failed");

  const { startsAt, window } = resolveStartsAt(post, parseResult, parsedAt);
  const endsAt = parseResult.time?.endsAt ?? null;
  const expiresAt = computeExpiresAt(startsAt, endsAt, parseResult.date, window);

  const lane = postSourceToLane(post.source);
  const laneConfidence = sourceConfidence(lane);

  // The incoming row's own `expires_at` IS its effective end, which is why the db
  // layer takes it from here rather than computing it: doing so there would put expiry
  // policy in the database layer.
  //
  // ⚠ THE RESULT IS NOT FILTERED ON `is_negation`, AND THAT IS THIS MODULE'S DECISION
  // TO OWN. `findOverlapping` deliberately does not filter, saying so and leaving the
  // choice to its caller. Today the choice is unobservable: a cancellation writes no
  // row (#1), so nothing in the table carries `is_negation = true` and filtering would
  // guard a case that cannot occur — untestable except by hand-writing a row the
  // system never creates.
  //
  // It becomes observable the moment Phase 5 adds the manual "closed today" toggle the
  // column was kept for. At that point a toggle row WOULD be returned here and this
  // matrix would happily delete it, cancelling the cancellation. Recorded now, at the
  // line that would have to change, because the alternative is discovering it from a
  // truck whose "closed" marker keeps disappearing.
  const existing = await findOverlapping(post.truck_id, startsAt, expiresAt);
  if (!overridesAll(lane, existing)) return noLocation(post, "outranked");

  const location = await insertLocation({
    truck_id: post.truck_id,
    // Set on every ingest-path insert. It is what makes a location traceable back to
    // the caption it came from, which is the whole basis of the re-parse loop.
    post_id: post.id,
    latitude: resolved.latitude,
    longitude: resolved.longitude,
    address_raw: resolved.addressRaw,
    address_geocoded: resolved.addressGeocoded,
    starts_at: startsAt,
    // Null is meaningful and stays null: it records that the caption gave no closing
    // time. `expires_at` is where the inferred end lives, and conflating the two would
    // make a guess indistinguishable from something the truck stated.
    ends_at: endsAt,
    source: lane,
    confidence: parseResult.parserConfidence * laneConfidence,
    parser_confidence: parseResult.parserConfidence,
    source_confidence: laneConfidence,
    // Always false here. A cancellation writes no row at all (#1); the column stays
    // for a possible Phase 5 manual "closed today" toggle.
    is_negation: false,
    expires_at: expiresAt,
  });

  // ⚠ INSERT BEFORE DELETE, AND THE ISSUE'S CHECKLIST SAYS "delete-then-insert". The
  // order only matters when the second operation fails, and the two failures are not
  // equally bad: delete-then-insert leaves the truck with NO pin and no record of the
  // one it had, while insert-then-delete leaves two overlapping pins. The project's
  // standing bias is toward keeping data when a step fails, so the recoverable failure
  // is the one to choose. Flagged in the PR as a deviation rather than made quietly.
  //
  // ⚠ AN EARLIER VERSION OF THIS COMMENT SAID THE DUPLICATE IS "resolved by the next
  // post through this same matrix". THAT IS FALSE FOR THE LANE IT MATTERS MOST ON, and
  // the matrix twelve lines above is what makes it false (PR #107 review r1).
  //
  // A duplicate pair is two rows on the lane that wrote them — normally `webhook`. The
  // next webhook post must beat BOTH to clear them, and `OVERRIDE.webhook.webhook` is
  // `discard`. So the truck's own subsequent posts cannot clean up after it: only a
  // `manual` post or `expires_at` does, which bounds it at midnight rather than at the
  // next post. Still recoverable, still bounded, still the better of the two failures
  // — but hours, not minutes, and not self-healing in the way that was claimed.
  //
  // Both this window and the concurrency race that produces the same state without any
  // failure at all are closed properly by #108 (atomic replace) and #109 (an exclusion
  // constraint). #109 also settles this ordering in the opposite direction, which is
  // where it belongs: a consequence of an invariant rather than a choice between two
  // ways to lose.
  // ⚠ THE OVERRIDE DECISION IS PER-ROW; THE DELETION IS NOT, AND THAT ASYMMETRY LOSES
  // DATA ON A PARTIAL OVERLAP (#112, PR #107 review r2). A row is matched if it
  // overlaps AT ALL and is then removed WHOLE, so an existing manual Heden 11:00–20:00
  // met by a manual "Järntorget 19-21" posted at 15:00 — sharing one hour — loses the
  // entire Heden row at 15:00, four hours before its replacement begins. The truck's
  // live pin disappears and nothing takes its place.
  //
  // The model assumes a superseding location is roughly COEXTENSIVE with what it
  // supersedes — true of the crosspost and re-post cases it was designed around, false
  // whenever the windows merely touch. Fixing it means truncating the survivor rather
  // than deleting it, which needs a db primitive that does not exist yet.
  const replaced = existing.map((row) => row.id);
  await deleteLocations(replaced);

  // ONLY after a successful insert, which is the acceptance criterion in both
  // directions: updated here, and never reached by any path above.
  //
  // ⚠ THIS FIRES FOR A FUTURE-DATED INSERT TOO, AND THAT IS A DECISION RATHER THAN AN
  // OVERSIGHT (PR #107 review r1, settled with the user). "Vi står vid Järntorget
  // imorgon" posted on Saturday moves `last_known_*` to Järntorget on SATURDAY — a
  // place the truck has not been, and if it spent the week at Lindholmen the grey
  // marker moves off Lindholmen on the strength of a sentence about tomorrow.
  //
  // Two readings of the column, and the choice is between them:
  //
  //   "the most recent position INFORMATION we have"  ← this one. An announcement
  //                                                     about tomorrow is the freshest
  //                                                     thing we know, and it is what
  //                                                     0001 describes: updated "on
  //                                                     each successful location
  //                                                     insert".
  //   "where the truck most recently ACTUALLY WAS"      would need `starts_at <= now()`
  //                                                     here, making this impure and
  //                                                     adding a branch.
  //
  // Kept as-is because the grey marker is ALREADY the "we do not know" state, and on
  // Saturday both candidates are guesses — Lindholmen a stale one, Järntorget one
  // about a different day. Neither is right, and the strict reading buys precision the
  // marker does not claim to have.
  //
  // Written down because the next reader will notice this and reason exactly as the
  // review did. It is a weighed trade, not a missed `starts_at` check.
  await updateLastKnownPosition(post.truck_id, resolved.latitude, resolved.longitude);
  await updateParsingStatus(post.id, "parsed");

  return { kind: "inserted", location, replaced };
}
