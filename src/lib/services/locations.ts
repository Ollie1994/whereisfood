import {
  cancelLocation,
  confirmLocation,
  findLocationsOverlapping,
  getLocationById,
  insertLocation,
  updateLocation,
} from "@/lib/db/locations";
import { getActiveTruckById, listAllTrucks } from "@/lib/db/trucks";
import { isInGothenburg } from "@/lib/geo";
import { stockholmDay, stockholmMidnight, stockholmWallClock } from "@/lib/stockholm";
import type { Location, LocationPatch } from "@/lib/types";
import { LOCATION_ERRORS, type NewLocationInput } from "@/lib/validators/location";

// Admin location logic (Phase 7 plan, "Functions and types"). No HTTP: a refusal is a
// reason, which the route turns into a status. The clock comes in as `now`, from the route
// (`CLAUDE.md`, "Time"). The database only through the db layer, which never deletes.

// An entry with its truck's name, for the admin's list.
export type AdminEntry = Location & { truck_name: string };

export type Refusal = { ok: false; reason: "invalid" | "not-found" | "conflict"; error: string };
export type EntryResult = { ok: true; entry: Location } | Refusal;

export const ENTRY_ERRORS = {
  truck: "Foodtrucken finns inte eller är inte aktiv",
  ended: "Tiden har redan passerat",
  endedEdit: "Posten har redan slutat och kan inte ändras",
  notFound: "Posten finns inte",
  overlap: "Överlappar med en annan post för samma foodtruck",
} as const;

// How far ahead the admin's list reads, from the start of today (#24).
export const LIST_DAYS = 14;

const refuse = (reason: Refusal["reason"], error: string): Refusal => ({ ok: false, reason, error });

// The exclusion constraint's code, which the db layer lets through unchanged.
function isOverlap(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23P01";
}

// "2026-08-22 11:00–14:00", or with both dates when the end falls on another day.
function describeWindow(entry: Pick<Location, "starts_at" | "ends_at">): string {
  const start = stockholmWallClock(new Date(entry.starts_at));
  const end = stockholmWallClock(new Date(entry.ends_at));
  const until = end.date === start.date ? end.time : `${end.date} ${end.time}`;
  return `${start.date} ${start.time}–${until}`;
}

// The refusal for a `23P01`, naming the truck's entry it overlaps. Read after the failed
// write, so that entry may since have been cancelled: then the text names none.
async function overlapRefusal(
  truckId: string,
  window: Pick<Location, "starts_at" | "ends_at">,
  editedId: string | null,
): Promise<Refusal> {
  const rows = await findLocationsOverlapping(window.starts_at, window.ends_at);
  const other = rows.find((row) => row.truck_id === truckId && row.id !== editedId);
  return refuse(
    "conflict",
    other ? `Överlappar med ${describeWindow(other)} — redigera den istället` : ENTRY_ERRORS.overlap,
  );
}

const hasEnded = (entry: Pick<Location, "ends_at">, now: Date) => Date.parse(entry.ends_at) <= now.getTime();

// Live entries overlapping today and the next `LIST_DAYS - 1` days, by start, each with its
// truck's name. From `listAllTrucks`, so an inactive truck's entry keeps its name.
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
    if (isOverlap(error)) return overlapRefusal(input.truck_id, input, null);
    throw error;
  }
}

// An edit of a live entry. The patch is checked alone by `parseLocationPatch`; here the
// merged entry is, so a patch with one time or one coordinate is refused with 400 and
// never reaches the database's `23514`. An entry that has ended can't be edited, and an
// edit can't end it in the past (#33).
export async function editEntry(id: string, patch: LocationPatch, now: Date): Promise<EntryResult> {
  const current = await getLocationById(id);
  if (!current) return refuse("not-found", ENTRY_ERRORS.notFound);
  if (hasEnded(current, now)) return refuse("invalid", ENTRY_ERRORS.endedEdit);

  const merged = { ...current, ...patch };
  if (!isInGothenburg(merged.latitude, merged.longitude)) return refuse("invalid", LOCATION_ERRORS.outside);
  if (Date.parse(merged.ends_at) <= Date.parse(merged.starts_at)) return refuse("invalid", LOCATION_ERRORS.order);
  if (hasEnded(merged, now)) return refuse("invalid", ENTRY_ERRORS.ended);

  try {
    const entry = await updateLocation(id, patch);
    // Cancelled between the read and the write.
    return entry ? { ok: true, entry } : refuse("not-found", ENTRY_ERRORS.notFound);
  } catch (error) {
    if (isOverlap(error)) return overlapRefusal(current.truck_id, merged, id);
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
