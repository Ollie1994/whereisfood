import { supabaseAdmin } from "@/lib/supabase";
import type { Location, NewLocation } from "@/lib/types";

// DB access only — no business logic. This layer FINDS and MUTATES rows; whether a
// found row should be overridden is the locations service's decision (#68), and the
// separation is what keeps the override matrix in one testable place instead of leaking
// half of itself into a query.
//
// Postgres errors propagate unchanged. Interpreting them — a 23505 that means a benign
// replay, a constraint violation that means a bug — needs context this layer does not
// have, and `persistPost` already shows what that interpretation looks like one layer
// up.
//
// ⚠ A TIMESTAMP DOES NOT SURVIVE A ROUND TRIP AS THE SAME STRING, and the next module
// to touch these rows is the one that will trip on it. We send
// `"2026-08-22T09:00:00.000Z"` (what `toISOString()` produces, and what `time.ts`
// returns); Postgres gives back `"2026-08-22T09:00:00+00:00"`. Same instant, different
// text — verified by test rather than assumed.
//
// So `stored.expires_at === parsed.startsAt` is FALSE for identical moments, and `<`
// or `>` between a stored value and a parser-generated one compares text whose ordering
// is only coincidentally right. Ordering within ONE format is correct, which is exactly
// what makes this easy to get away with until it is not.
//
// The queries below are unaffected — the comparison happens in Postgres, which parses
// both forms. It is the SERVICE (#68), comparing a stored row against a `ParseResult`
// in JavaScript, that must compare instants (`Date.parse`) and not strings.

// Insert and return the stored row, including the generated `id` the caller needs for
// `locations.post_id` bookkeeping and for a later delete.
//
// `.select().single()` rather than a bare insert: without it PostgREST returns no body
// and the caller would have to re-query for the id it just created.
export async function insertLocation(location: NewLocation): Promise<Location> {
  const { data, error } = await supabaseAdmin
    .from("locations")
    .insert(location)
    .select()
    .single();

  if (error) throw error;
  // The cast narrows `source` from the column's plain `string` to the three-value lane
  // union. Postgres CHECK constraints carry no type information into the generated
  // types (only real enum types do), which is the same narrowing `types.ts` applies to
  // `Location` itself — `locations_source_check` is what actually enforces it.
  return data as Location;
}

// Locations for this truck whose live window overlaps [startsAt, effectiveEnd).
//
// ⚠ COMPARES `expires_at`, NEVER `ends_at`, AND THIS IS THE PHASE'S MOST CONSEQUENTIAL
// CORRECTION (plan hazard H4). The documented predicate was:
//
//   existing.starts_at < incoming.ends_at AND existing.ends_at > incoming.starts_at
//
// `ends_at` is NULLABLE BY DESIGN — migration 0002 records the reason, "the expiry rule
// explicitly handles 'no ends_at extracted'". Under SQL's three-valued logic every
// comparison against NULL yields NULL, and `WHERE NULL` drops the row. So that
// predicate cannot see a location with no end time, which means:
//
//   such a location is NEVER matched as overlapping, so it can never be overridden —
//   a 0.55 email pin becomes permanently unreplaceable, even by a manual post, and
//   duplicate pins accumulate for the same truck and window.
//
// Not an edge case. It is the `location only (no time)` row of the confidence matrix,
// produced by an ordinary caption like "Vi står vid Järntorget idag".
//
// `expires_at` is NOT NULL and always computed, and by construction IS the effective
// end: `ends_at` when one was extracted, the capped `posted_at + 8h` otherwise (#5). It
// means exactly "when this location stops being live", which is what overlap is asking.
//
// ⚠ THE CALLER SUPPLIES `effectiveEnd` FOR THE SAME REASON. An incoming location with
// no `ends_at` cannot form the query at all, so the service passes the incoming row's
// own `expires_at` — computing it here would put expiry policy in the db layer.
//
// HALF-OPEN ON BOTH SIDES, which is what makes adjacent windows not overlap: a location
// ending at 14:00 and one starting at 14:00 are back-to-back, not in conflict. `lt`/`gt`
// rather than `lte`/`gte` is what expresses that, and plan decision #6 keeps `>` here
// while negations compare with `>=` — a distinction that lives in the service.
//
// ⚠ NOT FILTERED ON `is_negation`. A negation writes no row (#1), so today nothing here
// carries `is_negation = true`; the column stays for a possible Phase 5 manual "closed
// today" toggle. Filtering now would encode an assumption the caller should own.
export async function findOverlapping(
  truckId: string,
  startsAt: string,
  effectiveEnd: string,
): Promise<Location[]> {
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("*")
    .eq("truck_id", truckId)
    .lt("starts_at", effectiveEnd)
    .gt("expires_at", startsAt);

  if (error) throw error;
  return (data ?? []) as Location[];
}

// Delete by id. PLURAL because a cancellation covers a window rather than a row: "inte
// idag" can supersede several locations for the same truck on the same day (#1).
//
// ⚠ THE EMPTY-ARRAY GUARD IS AN OPTIMISATION, AND AN EARLIER VERSION OF THIS COMMENT
// CLAIMED IT WAS A CORRECTNESS REQUIREMENT — that `.in("id", [])` is a PostgREST syntax
// error rather than a harmless no-match. Measured against the real database: it returns
// **204 with no error**, and the equivalent select returns `[]`. Nothing breaks.
//
// Found because deleting the guard failed no test, which under the rule adopted at the
// end of #63 is evidence about the CLAIM rather than a gap in coverage — and the claim
// was wrong.
//
// The guard stays, for the smaller true reason: an empty list is the ORDINARY case — a
// negation for a truck with nothing scheduled is a silent no-op by design (#1) — and
// skipping a pointless HTTP round trip for it is worth one line. The test below pins the
// OUTCOME (no throw, nothing deleted), which is what callers depend on whether this
// guard or PostgREST provides it.
export async function deleteLocations(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  const { error } = await supabaseAdmin.from("locations").delete().in("id", ids);

  if (error) throw error;
}
