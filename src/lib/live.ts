import { isValid, parseISO } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { Location, Truck } from "@/lib/types";

// The `/api/live` response contract and the pure helpers the service, the route, the
// map hooks and the popup share (Phase 6 plan, "Functions and types"). No React, no env
// and no clock: every function that needs the time takes `now`.

export const TZ = "Europe/Stockholm";

type TruckId = Truck["id"];

// Field types come from the row types by `Pick`, so a migration that changes a column
// changes these too. The service builds each entry field by field (plan #11), so no
// other column reaches the body.
export type LiveEntry = Pick<
  Location,
  "id" | "latitude" | "longitude" | "label" | "starts_at" | "ends_at" | "updated_at"
> & {
  truck: Pick<Truck, "id" | "name" | "instagram_handle" | "cuisine_type">;
};

export type LiveResponse = { entries: LiveEntry[] };

export type MarkerEntry = { entry: LiveEntry; status: "open" | "later" };

export type MarkerDiff = {
  add: MarkerEntry[];
  update: MarkerEntry[];
  remove: TruckId[];
};

// --- The guard the client applies to a 2xx body ---------------------------------

// A date, a time with optional fractional seconds, and an offset. PostgREST returns
// `…T09:00:00+00:00`, and `updated_at` (from `now()`) with microseconds,
// `…T06:50:08.606373+00:00` (local stack, 2026-10-25). The pattern comes first
// because `parseISO` alone accepts `"2026"`, and a string with no offset, which it
// reads in the browser's own time zone (both pinned in `live.test.ts`).
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && TIMESTAMP.test(value) && isValid(parseISO(value));
}

function isLiveEntry(value: unknown): value is LiveEntry {
  if (!isRecord(value)) return false;
  const truck = value.truck;
  if (!isRecord(truck)) return false;
  return (
    typeof value.id === "string" &&
    typeof truck.id === "string" &&
    typeof truck.name === "string" &&
    isNullableString(truck.instagram_handle) &&
    isNullableString(truck.cuisine_type) &&
    isNullableString(value.label) &&
    Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude) &&
    isTimestamp(value.starts_at) &&
    isTimestamp(value.ends_at) &&
    isTimestamp(value.updated_at)
  );
}

// One bad entry fails the whole body: the hook then keeps its last good data (plan #16).
export function isLiveResponse(body: unknown): body is LiveResponse {
  return isRecord(body) && Array.isArray(body.entries) && body.entries.every(isLiveEntry);
}

// --- Stockholm calendar days ------------------------------------------------------

const DAY_MS = 86_400_000;

// The Stockholm calendar date of `date`, as a count of days since 1970-01-01. Day
// arithmetic on it is plain integer arithmetic, with no DST in it.
function stockholmDay(date: Date | string): number {
  const [y, m, d] = formatInTimeZone(date, TZ, "yyyy-MM-dd").split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

// Midnight in Stockholm at the start of `day`. Not the previous midnight plus 24 h:
// 2026-03-29 is 23 h long and 2026-10-25 is 25 h (`live.test.ts`'s DST cases).
function stockholmMidnight(day: number): Date {
  const date = new Date(day * DAY_MS).toISOString().slice(0, 10);
  return fromZonedTime(`${date}T00:00:00`, TZ);
}

function ms(timestamp: string): number {
  return parseISO(timestamp).getTime();
}

// --- Which entries and markers show -------------------------------------------------

// Entries not yet ended that start before the next Stockholm midnight after `now`.
export function todaysEntries(entries: readonly LiveEntry[], now: Date): LiveEntry[] {
  const nextMidnight = stockholmMidnight(stockholmDay(now) + 1).getTime();
  return entries.filter(
    (entry) => ms(entry.ends_at) > now.getTime() && ms(entry.starts_at) < nextMidnight,
  );
}

// One marker per truck (plan #12): the entry open at `now`, else the earliest later one.
// An entry already ended gives none.
export function markerFor(entries: readonly LiveEntry[], now: Date): Map<TruckId, MarkerEntry> {
  const markers = new Map<TruckId, MarkerEntry>();
  const t = now.getTime();
  for (const entry of entries) {
    const starts = ms(entry.starts_at);
    const ends = ms(entry.ends_at);
    if (ends <= t) continue;
    const status = starts <= t ? "open" : "later";
    const current = markers.get(entry.truck.id);
    if (
      !current ||
      (status === "open" && current.status === "later") ||
      (status === current.status && starts < ms(current.entry.starts_at))
    ) {
      markers.set(entry.truck.id, { entry, status });
    }
  }
  return markers;
}

// Every field that moves the marker, restyles it or shows in the popup. A field the
// popup starts showing goes in here too, or an open popup keeps the old value.
function sameMarker(a: MarkerEntry, b: MarkerEntry): boolean {
  return (
    a.entry.id === b.entry.id &&
    a.entry.latitude === b.entry.latitude &&
    a.entry.longitude === b.entry.longitude &&
    a.status === b.status &&
    a.entry.label === b.entry.label &&
    a.entry.starts_at === b.entry.starts_at &&
    a.entry.ends_at === b.entry.ends_at &&
    a.entry.updated_at === b.entry.updated_at &&
    a.entry.truck.name === b.entry.truck.name &&
    a.entry.truck.cuisine_type === b.entry.truck.cuisine_type &&
    a.entry.truck.instagram_handle === b.entry.truck.instagram_handle
  );
}

// What `useMapLibre` applies to its live markers, keyed by truck id (plan #14).
export function diffMarkers(
  prev: ReadonlyMap<TruckId, MarkerEntry>,
  next: ReadonlyMap<TruckId, MarkerEntry>,
): MarkerDiff {
  const diff: MarkerDiff = { add: [], update: [], remove: [] };
  for (const [truckId, marker] of next) {
    const old = prev.get(truckId);
    if (!old) diff.add.push(marker);
    else if (!sameMarker(old, marker)) diff.update.push(marker);
  }
  for (const truckId of prev.keys()) {
    if (!next.has(truckId)) diff.remove.push(truckId);
  }
  return diff;
}

// --- Popup text ------------------------------------------------------------------------

function clock(timestamp: string): string {
  return formatInTimeZone(timestamp, TZ, "HH:mm");
}

export function hoursText(entry: LiveEntry): string {
  return `${clock(entry.starts_at)}–${clock(entry.ends_at)}`;
}

export function statusText(marker: MarkerEntry): string {
  return marker.status === "open" ? "Öppet nu" : `Öppnar ${clock(marker.entry.starts_at)}`;
}

// Index = ISO weekday (`i`) - 1, and month (`M`) - 1.
const WEEKDAYS = ["måndags", "tisdags", "onsdags", "torsdags", "fredags", "lördags", "söndags"];
const MONTHS = ["jan", "feb", "mars", "apr", "maj", "juni", "juli", "aug", "sep", "okt", "nov", "dec"];

// By Stockholm calendar days between `updated_at` and `now` (plan, open decision 5).
export function freshnessText(updatedAt: string, now: Date): string {
  const days = stockholmDay(now) - stockholmDay(updatedAt);
  const time = clock(updatedAt);
  if (days <= 0) return `Uppdaterad ${time}`;
  if (days === 1) return `Uppdaterad igår ${time}`;
  if (days < 7) {
    const weekday = WEEKDAYS[Number(formatInTimeZone(updatedAt, TZ, "i")) - 1];
    return `Uppdaterad i ${weekday} ${time}`;
  }
  const [year, month, day] = formatInTimeZone(updatedAt, TZ, "yyyy-M-d").split("-");
  const date = `${day} ${MONTHS[Number(month) - 1]}`;
  const sameYear = year === formatInTimeZone(now, TZ, "yyyy");
  return `Uppdaterad ${sameYear ? date : `${date} ${year}`} ${time}`;
}
