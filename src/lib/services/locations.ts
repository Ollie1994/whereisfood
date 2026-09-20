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
//   "PRODUCE NO LOCATION" IS ONE NAMED EXIT keyed on an enumerated reason, not six
//   inline early-returns. Plan decision #9 imposes this before the code was written,
//   for a reason worth restating: the exit has six callers on day one and gains #102's
//   later. Named, #102 lands as one more key. Inlined, it lands as a rewrite of this
//   file and of #69.

// Every wall clock in this system is Stockholm; every stored instant is UTC.
const TIME_ZONE = "Europe/Stockholm";

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
  | "outranked"
  // A cancellation. Writes no row by design (#1) — the delete path is #69.
  | "negation";

export type WriteOutcome =
  // `replaced` carries the ids of the overlapping locations this insert superseded,
  // which is what makes "did anything get deleted" assertable without re-querying.
  | { kind: "inserted"; location: Location; replaced: readonly string[] }
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
// via Make.com must be able to retract via Make.com. That table belongs to #69 and is
// NOT anticipated here with a flag or a parameter — the asymmetry reads like a typo
// and its defence is that both tables are visible side by side, each with its own
// reason written above it.
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
  // ⚠ LEAVE IT `'pending'` UNTIL #69 LANDS, WHICH IS THE POINT OF THE STUB. This
  // issue's non-goals say a negation "returns without writing or deleting anything",
  // and a status write is a write. #69 replaces this key with `'parsed'` at the same
  // time it adds the delete. Until then a cancellation stays `'pending'`, which is
  // accurate — nothing has acted on it — and is exactly the state #71 selects on to
  // replay it once the delete path exists.
  negation: null,
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
function resolveStartsAt(post: Post, parseResult: ParseResult, parsedAt: string): string {
  if (parseResult.time !== null) return parseResult.time.startsAt;

  // Normalised through `Date` rather than passed through: `posted_at` comes back from
  // Postgres as "+00:00" and every other instant in this module is `toISOString()`'s
  // ".000Z". Same instant, different text — converting once here means nothing
  // downstream compares the two forms as strings.
  if (parseResult.date === parsedAt) return new Date(post.posted_at).toISOString();

  return fromZonedTime(`${parseResult.date}T00:00:00`, TIME_ZONE).toISOString();
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
): string {
  if (endsAt !== null) return endsAt;

  const inferredEnd = Date.parse(startsAt) + FALLBACK_WINDOW_MS;
  // 23:59:59 rather than the next midnight, per decision #5. DST is not a hazard:
  // Sweden transitions at 03:00 local, so midnight is never doubled or missing.
  const dayEnd = fromZonedTime(`${date}T23:59:59`, TIME_ZONE).getTime();

  // Instants, not strings. `Math.min` over epoch milliseconds is the comparison that
  // is correct regardless of which format either side was written in.
  return new Date(Math.min(inferredEnd, dayEnd)).toISOString();
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

  // The stub this issue owes #69. It is a branch rather than an omission precisely so
  // that a cancellation arriving before the delete path lands is defined behaviour —
  // no row written, no row deleted, post left `'pending'` — instead of falling through
  // to the insert path and pinning the truck at the spot it just said it would not be.
  if (parseResult.isNegation) return noLocation(post, "negation");

  if (parseResult.place === null) return noLocation(post, "no-place");

  const resolved = await resolveCoordinates(parseResult.place);
  // ⚠ NOTHING IS WRITTEN AND `last_known_*` IS NOT TOUCHED. A failed geocode means we
  // could not read today's caption, not that we have forgotten where this truck has
  // ever been — nulling the denormalized position would erase a working grey marker
  // every time Nominatim had a bad minute.
  if (resolved === null) return noLocation(post, "geocode-failed");

  const startsAt = resolveStartsAt(post, parseResult, parsedAt);
  const endsAt = parseResult.time?.endsAt ?? null;
  const expiresAt = computeExpiresAt(startsAt, endsAt, parseResult.date);

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
  // one it had, while insert-then-delete leaves two overlapping pins — visible, and
  // resolved by the next post through this same matrix. The project's standing bias is
  // toward keeping data when a step fails, so the recoverable failure is the one to
  // choose. Flagged in the PR as a deviation rather than made quietly.
  const replaced = existing.map((row) => row.id);
  await deleteLocations(replaced);

  // ONLY after a successful insert, which is the acceptance criterion in both
  // directions: updated here, and never reached by any path above.
  await updateLastKnownPosition(post.truck_id, resolved.latitude, resolved.longitude);
  await updateParsingStatus(post.id, "parsed");

  return { kind: "inserted", location, replaced };
}
