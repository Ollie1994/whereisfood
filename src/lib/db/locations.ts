import { supabaseAdmin } from "@/lib/supabase";
import type { Location, LocationPatch, NewLocation } from "@/lib/types";

// DB access only — this layer finds and mutates rows and decides nothing (Phase 5 plan,
// #10):
// - Postgres errors propagate unchanged, so an overlap reaches the service as `23P01`
//   and an inverted window as `23514` (`db-locations.test.ts` pins the first).
// - No function reads the clock. The caller passes every timestamp, so time stays in
//   the service (`CLAUDE.md`, "Time").
// - No function deletes. Ended and cancelled are filters.
//
// ⚠ A timestamp doesn't round-trip as the same string: we send `…T09:00:00.000Z`,
// PostgREST returns `…T09:00:00+00:00` (seen in PR #106 and again in this module's
// rows on 2026-10-19). Compare instants (`Date.parse`) in JavaScript, never the
// strings. The tests compare instants and don't pin the text.

// Every column except `created_by`, which no read returns (#8). ONE STRING LITERAL:
// supabase-js infers the row type from the literal text, and with rows returned uncast
// `tsc` then fails if a column of `Location` is missing (issue #48). Never cast a row to
// `Location`: a cast compiles with a column missing (Phase 5 plan, "Functions and
// types"). An extra column isn't a type error; `db-locations.test.ts`'s key-set test
// catches that.
export const LOCATION_COLUMNS =
  "id, truck_id, latitude, longitude, label, starts_at, ends_at, cancelled_at, source, created_at, updated_at";

// Insert and return the stored row. Raises `23P01` on an overlap with a live row of the
// same truck, `23514` when `ends_at <= starts_at`.
export async function insertLocation(location: NewLocation): Promise<Location> {
  const { data, error } = await supabaseAdmin
    .from("locations")
    .insert(location)
    .select(LOCATION_COLUMNS)
    .single();

  if (error) throw error;
  return data;
}

// Edit place, label or times of a row that isn't cancelled. Null when no such row.
// Raises `23P01` or `23514` like `insertLocation`.
//
// ⚠ THROWS ON AN EMPTY PATCH, before any request: PostgREST answers an empty PATCH by
// updating no row (probed 2026-10-18: `{}` on an existing truck → `200 []`), so this
// would return null for a row that exists. A key set to `undefined` is dropped from the
// JSON body, so it counts as absent.
export async function updateLocation(
  id: string,
  patch: LocationPatch,
): Promise<Location | null> {
  if (Object.values(patch).every((value) => value === undefined)) {
    throw new Error("updateLocation: the patch sets no column");
  }

  const { data, error } = await supabaseAdmin
    .from("locations")
    .update(patch)
    .eq("id", id)
    .is("cancelled_at", null)
    .select(LOCATION_COLUMNS)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// Cancel a live row: set `cancelled_at` where it is still null. Null when the row is
// missing or already cancelled, so a second cancel can't move the first's timestamp.
export async function cancelLocation(
  id: string,
  cancelledAt: string,
): Promise<Location | null> {
  const { data, error } = await supabaseAdmin
    .from("locations")
    .update({ cancelled_at: cancelledAt })
    .eq("id", id)
    .is("cancelled_at", null)
    .select(LOCATION_COLUMNS)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// Live rows of every truck overlapping [from, to): `starts_at < to AND ends_at > from`.
// Half-open, so a row ending exactly at `from` is out. Not filtered on the truck's
// `is_active` (plan, open decision 6). Ordered by `starts_at`.
export async function findLocationsOverlapping(from: string, to: string): Promise<Location[]> {
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select(LOCATION_COLUMNS)
    .is("cancelled_at", null)
    .lt("starts_at", to)
    .gt("ends_at", from)
    .order("starts_at");

  if (error) throw error;
  return data;
}

// The truck's latest `limit` live rows that started before `before`, newest `starts_at`
// first. `before` is usually now, so future entries don't fill "recent places".
export async function listRecentLocationsForTruck(
  truckId: string,
  before: string,
  limit: number,
): Promise<Location[]> {
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select(LOCATION_COLUMNS)
    .eq("truck_id", truckId)
    .is("cancelled_at", null)
    .lt("starts_at", before)
    .order("starts_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}
