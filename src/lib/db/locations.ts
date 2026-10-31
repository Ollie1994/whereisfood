import type { TablesUpdate } from "@/lib/database.types";
import { MAX_ROWS, assertAllRows } from "@/lib/db/complete";
import { supabaseAdmin } from "@/lib/supabase";
import type { Location, LocationPatch, NewLocation } from "@/lib/types";

// DB access only — this layer finds and mutates rows and decides nothing (Phase 5 plan,
// #10):
// - Postgres errors propagate unchanged, so an overlap reaches the service as `23P01`
//   and an inverted window as `23514` (`db-locations.test.ts` pins the first).
// - No function reads the clock. The caller passes every timestamp, so time stays in
//   the service (`CLAUDE.md`, "Time").
// - No function deletes. Ended and cancelled are filters.
// - An id that isn't a uuid raises `22P02` ("invalid input syntax for type uuid"), not
//   null (probed 2026-10-19 on `updateLocation` and `cancelLocation`). Callers must
//   check the shape first; `isUuid` (`src/lib/validators/uuid.ts`) exists for it.
//
// ⚠ A timestamp doesn't round-trip as the same string: we send `…T09:00:00.000Z`,
// PostgREST returns `…T09:00:00+00:00` (seen in PR #106 and again in this module's
// rows on 2026-10-19). So compare a string we sent with one returned as instants
// (`Date.parse`), never as text; this module's tests do, and don't pin the text. Two
// strings that both came back can be compared as text: `api-live.test.ts` does, to
// catch a reformat or a lost microsecond.

// Every column except `created_by`, which no read returns (#8). ONE STRING LITERAL:
// supabase-js infers the row type from the literal text, and with rows returned uncast
// `tsc` then fails if a column of `Location` is missing (issue #48). Never cast a row to
// `Location`: a cast compiles with a column missing (Phase 5 plan, "Functions and
// types"). An extra column isn't a type error; `db-locations.test.ts`'s key-set test
// catches that. Module-private: other code reads locations through these functions.
const LOCATION_COLUMNS =
  "id, truck_id, latitude, longitude, label, starts_at, ends_at, cancelled_at, source, created_at, updated_at";

// ⚠ THE COLUMNS EACH WRITE MAY SEND, PICKED AT RUNTIME. `NewLocation` and
// `LocationPatch` are compile-time only: an object with more keys still type-checks
// (`LocationPatch` is all-optional, so anything sharing one key with it does), and
// supabase-js would send every key. So `{ ...row, label }` would rewrite `truck_id`,
// `cancelled_at` or `created_by` (`db-locations.test.ts`, "writes only…"). A `Record`
// over the type's keys makes `tsc` fail when the type gains or loses a column and the
// list doesn't.
const INSERT_KEYS: Record<keyof NewLocation, true> = {
  truck_id: true,
  latitude: true,
  longitude: true,
  label: true,
  starts_at: true,
  ends_at: true,
  source: true,
  created_by: true,
};

const PATCH_KEYS: Record<keyof LocationPatch, true> = {
  latitude: true,
  longitude: true,
  label: true,
  starts_at: true,
  ends_at: true,
};

// A copy of `source` with only the keys `keys` lists. Typed `T`: `keys` names every
// key of `T`, so each key `source` must have is copied.
function pick<T extends object>(source: T, keys: Record<keyof T, true>): T {
  const picked = {} as T;
  for (const key of Object.keys(keys) as (keyof T)[]) {
    if (key in source) picked[key] = source[key];
  }
  return picked;
}

// Insert and return the stored row. Raises `23P01` on an overlap with a live row of the
// same truck, `23514` when `ends_at <= starts_at`.
export async function insertLocation(location: NewLocation): Promise<Location> {
  const { data, error } = await supabaseAdmin
    .from("locations")
    .insert(pick(location, INSERT_KEYS))
    .select(LOCATION_COLUMNS)
    .single();

  if (error) throw error;
  return data;
}

// Update a row that isn't cancelled and return it; null when no such row. The one path
// for both edits and cancels, so the live-row filter and the select are written once.
async function updateLiveRow(
  id: string,
  values: TablesUpdate<"locations">,
): Promise<Location | null> {
  const { data, error } = await supabaseAdmin
    .from("locations")
    .update(values)
    .eq("id", id)
    .is("cancelled_at", null)
    .select(LOCATION_COLUMNS)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// Edit place, label or times of a row that isn't cancelled. Null when no such row.
// Raises `23P01` or `23514` like `insertLocation`.
//
// ⚠ THROWS ON AN EMPTY PATCH, before any request: PostgREST answers an empty PATCH by
// updating no row (probed 2026-10-18: `{}` on an existing truck → `200 []`), so this
// would return null for a row that exists. A key set to `undefined` is dropped from the
// JSON body, so it counts as absent, and so does a key `PATCH_KEYS` doesn't list.
export async function updateLocation(
  id: string,
  patch: LocationPatch,
): Promise<Location | null> {
  const picked = pick(patch, PATCH_KEYS);
  if (Object.values(picked).every((value) => value === undefined)) {
    throw new Error("updateLocation: the patch sets no column");
  }

  return updateLiveRow(id, picked);
}

// Cancel a live row: set `cancelled_at` where it is still null. Null when the row is
// missing or already cancelled, so a second cancel can't move the first's timestamp.
export async function cancelLocation(
  id: string,
  cancelledAt: string,
): Promise<Location | null> {
  return updateLiveRow(id, { cancelled_at: cancelledAt });
}

// Live rows of every truck overlapping [from, to): `starts_at < to AND ends_at > from`.
// Half-open, so a row ending exactly at `from` is out. Not filtered on the truck's
// `is_active` (plan, open decision 6). Ordered by `starts_at`, then `id`: rows sharing a
// start time (every 11:00 entry) would otherwise come back in any order
// (`db-locations.test.ts`, "breaks a starts_at tie").
//
// ⚠ THROWS RATHER THAN RETURN PART OF THE ROWS: a window wider than `max_rows` rows
// would lose its latest ones (`assertAllRows`).
export async function findLocationsOverlapping(from: string, to: string): Promise<Location[]> {
  const { data, error, count } = await supabaseAdmin
    .from("locations")
    .select(LOCATION_COLUMNS, { count: "exact" })
    .is("cancelled_at", null)
    .lt("starts_at", to)
    .gt("ends_at", from)
    .order("starts_at")
    .order("id");

  if (error) throw error;
  assertAllRows("findLocationsOverlapping", data, count);
  return data;
}

// The truck's latest `limit` live rows that started before `before`, newest `starts_at`
// first. `before` is usually now, so future entries don't fill "recent places".
//
// ⚠ `limit` MUST BE AN INTEGER FROM 1 TO `MAX_ROWS`, checked before any request. Above
// the API's `max_rows` the result is cut with no error (probed 2026-10-19: limit 2000
// over 1001 rows → 1000), and at or below it a cut can't happen while the API's cap is
// MAX_ROWS (`complete.ts` says where that is checked), so no count or second read is
// needed: an exact count would read the truck's whole history per call, which
// the `(truck_id, starts_at desc)` index exists to avoid (plan, #14). PostgREST rejects
// a zero, negative or fractional limit with a 400 that would reach the caller as an
// opaque error.
export async function listRecentLocationsForTruck(
  truckId: string,
  before: string,
  limit: number,
): Promise<Location[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_ROWS) {
    throw new Error(
      `listRecentLocationsForTruck: limit must be an integer from 1 to ${MAX_ROWS}, got ${limit}`,
    );
  }

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
