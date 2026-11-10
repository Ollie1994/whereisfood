import {
  cancelLocation,
  confirmLocation,
  findLocationsOverlapping,
  findTruckLocationsOverlapping,
  getLocationById,
  insertLocation,
  listRecentLocationsForTruck,
  updateLocation,
} from "@/lib/db/locations";
import { LIST_DAYS, hasEnded } from "@/lib/admin-list";
import { getActiveTruckById, listAllTrucks } from "@/lib/db/trucks";
import { stockholmDay, stockholmMidnight, stockholmWallClock } from "@/lib/stockholm";
import type { Location, LocationPatch } from "@/lib/types";
import { LOCATION_ERRORS, crossFieldError, type NewLocationInput } from "@/lib/validators/location";

// Admin location logic (Phase 7 plan, "Functions and types"). No HTTP: a refusal is a
// reason, which the route turns into a status. The clock comes in as `now`, from the route
// (`CLAUDE.md`, "Time"). The database only through the db layer, which never deletes.

// An entry with its truck's name, for the admin's list.
export type AdminEntry = Location & { truck_name: string };

// Where an entry stands: what the place picker fills and a recent place offers.
export type Place = Pick<Location, "latitude" | "longitude" | "label">;

// A recent place, with the times of the truck's newest entry there, which picking it fills
// (Phase 7 plan, #23, #35).
export type RecentPlace = Place & Pick<Location, "starts_at" | "ends_at">;

// The recent places offered: from the truck's last `RECENT_ENTRIES` entries, at most
// `RECENT_PLACES` (Phase 7 plan, #35).
export const RECENT_ENTRIES = 50;
export const RECENT_PLACES = 5;

export type Refusal = { ok: false; reason: "invalid" | "not-found" | "conflict"; error: string };
export type EntryResult = { ok: true; entry: Location } | Refusal;

export const ENTRY_ERRORS = {
  truck: "Foodtrucken finns inte eller är inte aktiv",
  ended: "Tiden har redan passerat",
  endedEdit: "Posten har redan slutat och kan inte ändras",
  notFound: "Posten finns inte",
  overlap: "Överlappar med en annan post för samma foodtruck",
} as const;

// What the 409 tells the admin after "Överlappar med <the other entry's times>": edit that
// entry, or, when #33 would refuse that edit, change this one (the owner's wording).
export const OVERLAP_ADVICE = {
  edit: " — redigera den istället",
  ended: ", som redan har slutat. Ändra tiden på den här posten.",
  running: ", som pågår nu. Ändra tiden på den här posten.",
} as const;

const refuse = (reason: Refusal["reason"], error: string): Refusal => ({ ok: false, reason, error });

// A Postgres error's code, which the db layer lets through unchanged.
function hasCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === code;
}

// The exclusion constraint's code.
const isOverlap = (error: unknown) => hasCode(error, "23P01");

// The time-order CHECK, by its name in the message: `23514` is every CHECK's code
// (`db-locations.test.ts` pins the name in `updateLocation`'s error).
const isOrderCheck = (error: unknown) =>
  hasCode(error, "23514") && String((error as { message?: unknown }).message).includes("locations_ends_after_starts");

// "2026-08-22 11:00–14:00", or with both dates when the end falls on another day.
function describeWindow(entry: Pick<Location, "starts_at" | "ends_at">): string {
  const start = stockholmWallClock(new Date(entry.starts_at));
  const end = stockholmWallClock(new Date(entry.ends_at));
  const until = end.date === start.date ? end.time : `${end.date} ${end.time}`;
  return `${start.date} ${start.time}–${until}`;
}

// The refusal for a `23P01`, naming the truck's entry it overlaps. Read after the failed
// write, so that entry may since have been cancelled: then the text names none. Two rows of
// the truck's, not every truck's: one may be the entry being edited, and a window can span
// years, where `findLocationsOverlapping` throws past `max_rows`.
async function overlapRefusal(
  truckId: string,
  window: Pick<Location, "starts_at" | "ends_at">,
  editedId: string | null,
  now: Date,
): Promise<Refusal> {
  const rows = await findTruckLocationsOverlapping(truckId, window.starts_at, window.ends_at, 2);
  const other = rows.find((row) => row.id !== editedId);
  if (!other) return refuse("conflict", ENTRY_ERRORS.overlap);
  return refuse("conflict", `Överlappar med ${describeWindow(other)}${overlapAdvice(other, window, now)}`);
}

// #33 refuses to edit an entry that has ended, and an edit ending one in the past. So when
// the other entry has ended, or is running while this one starts by now (its end can't move
// back to this start), the advice is to change this entry.
function overlapAdvice(
  other: Pick<Location, "starts_at" | "ends_at">,
  window: Pick<Location, "starts_at">,
  now: Date,
): string {
  if (hasEnded(other, now)) return OVERLAP_ADVICE.ended;
  const started = (iso: string) => Date.parse(iso) <= now.getTime();
  if (started(other.starts_at) && started(window.starts_at)) return OVERLAP_ADVICE.running;
  return OVERLAP_ADVICE.edit;
}

// Live entries overlapping today and the next `LIST_DAYS - 1` days, by start, each with its
// truck's name. From `listAllTrucks`, so an inactive truck's entry keeps its name.
//
// A limit, named in the plan's step 15: every truck's entries for 14 days, so
// `findLocationsOverlapping` throws, and the list answers 500, past `MAX_ROWS` live rows:
// about 36 trucks with two entries a day, each entered two weeks ahead (1,000 / 28). The
// same wall as `/api/live`'s (`project-context.md`, "1,000 rows, a hard wall"), and the
// same first fix.
export async function listAdminEntries(now: Date): Promise<AdminEntry[]> {
  const today = stockholmDay(now);
  const rows = await findLocationsOverlapping(
    stockholmMidnight(today).toISOString(),
    stockholmMidnight(today + LIST_DAYS).toISOString(),
  );
  // After the entries, not beside them: a truck created with an entry between two parallel
  // reads would have an entry and no name.
  const trucks = await listAllTrucks();

  const names = new Map(trucks.map((truck) => [truck.id, truck.name]));
  return rows.map((row) => {
    const name = names.get(row.truck_id);
    // `truck_id` references `trucks`, and the trucks are read after the entries, so only a
    // truck deleted between the two reads, which the app never does.
    if (name === undefined) throw new Error(`listAdminEntries: no truck ${row.truck_id}`);
    return { ...row, truck_name: name };
  });
}

// A new entry, written by `adminId` (#17). Refused when it has already ended (#33) or the
// truck isn't active; an overlap with the truck's other entry is a conflict.
export async function createEntry(input: NewLocationInput, adminId: string, now: Date): Promise<EntryResult> {
  if (hasEnded(input, now)) return refuse("invalid", ENTRY_ERRORS.ended);
  if (!(await getActiveTruckById(input.truck_id))) return refuse("invalid", ENTRY_ERRORS.truck);

  try {
    return { ok: true, entry: await insertLocation({ ...input, source: "admin", created_by: adminId }) };
  } catch (error) {
    if (isOverlap(error)) return overlapRefusal(input.truck_id, input, null, now);
    throw error;
  }
}

// An edit of a live entry. The patch is checked alone by `parseLocationPatch`; here the
// merged entry is (`crossFieldError`), so a patch with one time or one coordinate is
// refused with 400. Only the patch is written, so an edit in another tab between the read
// and the write keeps the fields this patch doesn't hold. Its other time can then make the
// stored pair out of order: the CHECK refuses that with `23514`, answered with the same
// 400. Its other coordinate keeps the pair in the box when that coordinate passed it too,
// as every app write's does: `isInGothenburg` checks each axis on its own. The schema has
// no range CHECK (`0001_baseline.sql`), so a row written outside the app isn't covered.
// An entry that has ended can't be edited, and an edit can't end it in the past (#33).
//
// Limits: the write has no precondition on what was read, so each rule on the merged row
// needs its own answer to an edit landing in between. The order and box rules have theirs,
// above. #33's merged end is judged on this tab's read: an end another tab wrote in
// between passed the same check there, at its own now. A new rule must add its answer. And
// the box is checked on the merged row whatever the patch holds, so a row written outside
// the app, outside the box, takes no edit until its pin is moved.
export async function editEntry(id: string, patch: LocationPatch, now: Date): Promise<EntryResult> {
  const current = await getLocationById(id);
  if (!current) return refuse("not-found", ENTRY_ERRORS.notFound);
  if (hasEnded(current, now)) return refuse("invalid", ENTRY_ERRORS.endedEdit);

  const merged = { ...current, ...patch };
  const invalid = crossFieldError(merged);
  if (invalid) return refuse("invalid", invalid);
  if (hasEnded(merged, now)) return refuse("invalid", ENTRY_ERRORS.ended);

  try {
    const entry = await updateLocation(id, patch);
    // Cancelled between the read and the write.
    return entry ? { ok: true, entry } : refuse("not-found", ENTRY_ERRORS.notFound);
  } catch (error) {
    if (isOverlap(error)) {
      // The window as stored plus this patch, not this tab's read: another tab may have
      // moved the time the patch doesn't hold. This tab's read if the row is gone since.
      const stored = await getLocationById(id);
      return overlapRefusal(current.truck_id, { ...(stored ?? current), ...patch }, id, now);
    }
    if (isOrderCheck(error)) return refuse("invalid", LOCATION_ERRORS.order);
    throw error;
  }
}

// Null for a missing or already-cancelled entry; a second cancel leaves the first's time.
export async function cancelEntry(id: string, now: Date): Promise<Location | null> {
  return cancelLocation(id, now.toISOString());
}

// "Stämmer fortfarande": moves `updated_at` (#18). Null for a missing or cancelled entry.
export async function confirmEntry(id: string, now: Date): Promise<Location | null> {
  return confirmLocation(id, now.toISOString());
}

// The truck's distinct places, newest first, from its live entries that started before
// `now`: one per label and pin, so a spot used every week shows once, with the times of
// its newest entry there.
export async function getRecentPlaces(truckId: string, now: Date): Promise<RecentPlace[]> {
  const rows = await listRecentLocationsForTruck(truckId, now.toISOString(), RECENT_ENTRIES);
  const places = new Map<string, RecentPlace>();
  for (const { latitude, longitude, label, starts_at, ends_at } of rows) {
    const key = JSON.stringify([label, latitude, longitude]);
    if (!places.has(key)) places.set(key, { latitude, longitude, label, starts_at, ends_at });
    if (places.size === RECENT_PLACES) break;
  }
  return [...places.values()];
}
