import { isValid, parseISO } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { Location, Truck } from "@/lib/types";

// The `/api/live` response contract and the pure helpers the service, the route, the
// map hooks and the popup share (Phase 6 plan, "Functions and types"). No React, no env
// and no clock: every function that needs the time takes `now`.

export const TZ = "Europe/Stockholm";

type TruckId = Truck["id"];

// Field types come from the row types by `Pick`, so a migration that changes a column
// changes these too. Plan #11: the service builds each entry field by field.
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

// `useLocations`' state: `loading` until the first request finishes, then `ok` after a
// good response and `failing` after a failed one.
export type FetchState = "loading" | "ok" | "failing";

// --- The guard the client applies to a 2xx body ---------------------------------

// A date, a time with optional fractional seconds, and an offset. PostgREST returns
// `…T09:00:00+00:00`, and `updated_at` (from `now()`) with microseconds,
// `…T06:50:08.606373+00:00` (local stack, 2026-10-25). The pattern comes first
// because `parseISO` alone accepts `"2026"`, and a string with no offset, which it
// reads in the browser's own time zone. The time's and the offset's hours are bounded
// here because `isValid(instant(…))` (`parseISO`) accepts `T24:00:00` and `+24:00`; it
// refuses `+01:60` itself (all pinned in `live.test.ts`).
const TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):\d{2})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && TIMESTAMP.test(value) && isValid(instant(value));
}

// MapLibre's `LngLat` constructor throws outside ±90 latitude and doesn't check
// longitude (`maplibre-gl-shared-dev.mjs` 6.11.2), and the schema has no range CHECK
// (`0001_baseline.sql`). Longitude is bounded to ±180 here all the same. NaN and
// ±Infinity fail the comparison (pinned in `live.test.ts`).
function isCoordinate(value: unknown, limit: number): value is number {
  return typeof value === "number" && Math.abs(value) <= limit;
}

// Exported for the service to drop a row that fails it (plan #20): `isLiveResponse`
// rejects a whole body for one bad entry.
export function isLiveEntry(value: unknown): value is LiveEntry {
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
    isCoordinate(value.latitude, 90) &&
    isCoordinate(value.longitude, 180) &&
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

// Every timestamp string is read here, never by passing the string to `formatInTimeZone`:
// date-fns-tz's own parser reads `…T24:00:00+00:00` as that day's 00:00 where `parseISO`
// reads the next day's (probed, PR #190 round 2). The guard refuses hour 24 as well.
function instant(timestamp: string): Date {
  return parseISO(timestamp);
}

// The Stockholm calendar date of `date`, as a count of days since 1970-01-01. Day
// arithmetic on it is plain integer arithmetic, with no DST in it.
function stockholmDay(date: Date): number {
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
  return instant(timestamp).getTime();
}

// --- Which entries and markers show -------------------------------------------------

// Entries not yet ended that start before the next Stockholm midnight after `now`.
export function todaysEntries(entries: readonly LiveEntry[], now: Date): LiveEntry[] {
  const nextMidnight = stockholmMidnight(stockholmDay(now) + 1).getTime();
  return entries.filter(
    (entry) => ms(entry.ends_at) > now.getTime() && ms(entry.starts_at) < nextMidnight,
  );
}

// One marker per truck (plan #12), among today's entries: the entry open at `now`, else
// the earliest later one. It applies `todaysEntries` itself, because the response holds
// entries up to `now + 26 h` and tomorrow's lunch must not show as "Öppnar 11:00".
export function markerFor(entries: readonly LiveEntry[], now: Date): Map<TruckId, MarkerEntry> {
  const markers = new Map<TruckId, MarkerEntry>();
  const t = now.getTime();
  for (const entry of todaysEntries(entries, now)) {
    const starts = ms(entry.starts_at);
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

// The entry id, the position, the status, and the fields #182 lists as the popup's. A
// field the popup starts showing goes in here too, or an open popup keeps the old value.
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

function clock(date: Date): string {
  return formatInTimeZone(date, TZ, "HH:mm");
}

// Index = ISO weekday (`i`) - 1, and month (`M`) - 1.
const WEEKDAYS = ["måndags", "tisdags", "onsdags", "torsdags", "fredags", "lördags", "söndags"];
const MONTHS = ["jan", "feb", "mars", "apr", "maj", "juni", "juli", "aug", "sep", "okt", "nov", "dec"];

// "24 okt" in Stockholm, with the year when it isn't `now`'s: "20 dec 2025".
function shortDate(date: Date, now: Date): string {
  const [year, month, day] = formatInTimeZone(date, TZ, "yyyy-M-d").split("-");
  const text = `${day} ${MONTHS[Number(month) - 1]}`;
  return year === formatInTimeZone(now, TZ, "yyyy") ? text : `${text} ${year}`;
}

// The word for Stockholm day `day` (the day of `date`), seen from `today`, `now`'s.
function dayWord(day: number, today: number, date: Date, now: Date): string {
  if (day === today) return "idag";
  if (day === today - 1) return "igår";
  if (day === today + 1) return "imorgon";
  return shortDate(date, now);
}

// Plan #21: the start's day is named when it isn't today, and the end's day when it
// differs from the start's: "11:00–14:00", "23:00–02:00 imorgon", "igår 20:00–12:00
// idag". An end at exactly midnight is "24:00" on the day before ("20:00–24:00",
// "20:00–24:00 imorgon"). Only exactly: rounding an end within midnight's minute moved
// its day too, so an entry open at 00:00:10 until 00:00:30 read as ended yesterday.
export function hoursText(entry: LiveEntry, now: Date): string {
  const today = stockholmDay(now);
  const start = instant(entry.starts_at);
  const end = instant(entry.ends_at);
  const startDay = stockholmDay(start);
  const atMidnight = stockholmMidnight(stockholmDay(end)).getTime() === end.getTime();
  const closing = atMidnight ? new Date(end.getTime() - 1) : end;
  const closingDay = stockholmDay(closing);
  const endClock = atMidnight ? "24:00" : clock(end);
  const from =
    startDay === today ? clock(start) : `${dayWord(startDay, today, start, now)} ${clock(start)}`;
  const to =
    closingDay === startDay ? endClock : `${endClock} ${dayWord(closingDay, today, closing, now)}`;
  return `${from}–${to}`;
}

export function statusText(marker: MarkerEntry): string {
  return marker.status === "open" ? "Öppet nu" : `Öppnar ${clock(instant(marker.entry.starts_at))}`;
}

// By Stockholm calendar days between `updated_at` and `now` (plan, open decision 5).
export function freshnessText(updatedAt: string, now: Date): string {
  const at = instant(updatedAt);
  const days = stockholmDay(now) - stockholmDay(at);
  const time = clock(at);
  if (days <= 0) return `Uppdaterad ${time}`;
  if (days === 1) return `Uppdaterad igår ${time}`;
  if (days < 7) {
    const weekday = WEEKDAYS[Number(formatInTimeZone(at, TZ, "i")) - 1];
    return `Uppdaterad i ${weekday} ${time}`;
  }
  return `Uppdaterad ${shortDate(at, now)} ${time}`;
}

// --- The map's notice -----------------------------------------------------------------

// Plan, open decisions 6 and 7. Nothing before the first response: an empty map then
// isn't "no trucks". While polls fail the markers stay (plan #16), so with none showing
// the notice says nothing could be fetched, and with some it says they may be old.
export function noticeText(fetchState: FetchState, markerCount: number): string | null {
  if (fetchState === "failing") {
    return markerCount === 0 ? "Kunde inte hämta foodtrucks. Försöker igen…" : "Kunde inte uppdatera";
  }
  if (fetchState === "ok" && markerCount === 0) return "Inga foodtrucks idag";
  return null;
}
