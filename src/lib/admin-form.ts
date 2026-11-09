import { LIST_DAYS } from "@/lib/admin-list";
import { SPOTS } from "@/lib/spots";
import { entryWindow, stockholmDay, stockholmWallClock } from "@/lib/stockholm";
import type { Location } from "@/lib/types";

// The admin screen's pure parts: the form's values, the request they make, and the list's
// texts. No clock (`now` comes in) and no fetch, so they are tested without a browser;
// `useLocationForm` and `useAdminLocations` hold the state and the requests.

// The form's times before the admin changes them (Phase 7 plan, #23). Kept after 13:00,
// when they have passed: saving them unchanged is refused by #33 (plan #34).
export const DEFAULT_START = "11:00";
export const DEFAULT_END = "13:00";

export const SAVED = "Sparat.";
export const SAVED_LATER = "Sparat. Posten är mer än två veckor fram och visas i listan när den närmar sig.";

// What the form says after a save: plain, or that the list won't show the entry yet (#24's
// limit), so a save past the window doesn't look like it failed (the owner's browser check).
export function savedText(entry: Pick<Location, "starts_at">, now: Date): string {
  const listEnd = stockholmDay(now) + LIST_DAYS;
  const shownFrom = stockholmDay(new Date(entry.starts_at));
  return shownFrom >= listEnd ? SAVED_LATER : SAVED;
}

// Under the times of an entry the form can't show exactly (`timesEditable`).
export const TIMES_READ_ONLY = "Den här postens tider kan inte ändras här. Ställ in den och lägg in en ny.";

export const FORM_ERRORS = {
  truck: "Välj en foodtruck",
  place: "Välj en plats",
  date: "Ogiltigt datum",
  time: "Den tiden finns inte den dagen",
} as const;

// What the form holds. `place` is a spot's name, or "" for an edit that keeps its place.
export type FormValues = {
  truckId: string;
  date: string;
  place: string;
  start: string;
  end: string;
};

export type EntryRequest = { ok: true; body: Record<string, unknown> } | { ok: false; error: string };

const DAY_MS = 86_400_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// `<input type="date">`'s "2026-08-22" as a Stockholm day number (`stockholm.ts`), or null.
export function dayOf(date: string): number | null {
  if (!DATE.test(date)) return null;
  const ms = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(ms) ? null : ms / DAY_MS;
}

// An end at or before the start, as wall-clock times, falls on the next day (#30).
export function endsNextDay(start: string, end: string): boolean {
  return end <= start;
}

export function emptyForm(now: Date): FormValues {
  return { truckId: "", date: stockholmWallClock(now).date, place: "", start: DEFAULT_START, end: DEFAULT_END };
}

// An entry as the form shows it for an edit: its own truck, Stockholm date and times, and
// its place kept unless the admin picks a spot.
export function formFromEntry(entry: Pick<Location, "truck_id" | "starts_at" | "ends_at">): FormValues {
  const start = stockholmWallClock(new Date(entry.starts_at));
  const end = stockholmWallClock(new Date(entry.ends_at));
  return { truckId: entry.truck_id, date: start.date, place: "", start: start.time, end: end.time };
}

function windowOf(values: FormValues): { startsAt: Date; endsAt: Date } | { error: string } {
  const day = dayOf(values.date);
  if (day === null) return { error: FORM_ERRORS.date };
  return entryWindow(day, values.start, values.end) ?? { error: FORM_ERRORS.time };
}

function placeOf(name: string): Record<string, unknown> | null {
  const spot = SPOTS.find((candidate) => candidate.name === name);
  return spot ? { latitude: spot.latitude, longitude: spot.longitude, label: spot.name } : null;
}

// The body of `POST /api/admin/locations`. The route checks the rest (#33, overlaps).
export function createRequest(values: FormValues): EntryRequest {
  if (!values.truckId) return { ok: false, error: FORM_ERRORS.truck };
  const place = placeOf(values.place);
  if (!place) return { ok: false, error: FORM_ERRORS.place };
  const window = windowOf(values);
  if ("error" in window) return { ok: false, error: window.error };

  return {
    ok: true,
    body: {
      truck_id: values.truckId,
      ...place,
      starts_at: window.startsAt.toISOString(),
      ends_at: window.endsAt.toISOString(),
    },
  };
}

// The body of `PATCH /api/admin/locations/[id]`: only what differs from the entry, so the
// route's merged-row checks see what the admin changed. An empty patch is sent as is, and
// the route answers it with its own message.
//
// Whether the form can show `entry`'s times exactly: its date, start and end rebuild to
// the stored window. Not for an entry longer than a day, one stored with seconds, or one
// whose wall times fall in a DST gap: the form shows such an entry's times read-only, and
// an edit of it changes its place alone (`editRequest`). The form's own entries always
// fit, since `entryWindow` ends one within a day of its start.
export function timesEditable(
  entry: Pick<Location, "truck_id" | "starts_at" | "ends_at">,
): boolean {
  const window = windowOf(formFromEntry(entry));
  return (
    !("error" in window) &&
    window.startsAt.getTime() === Date.parse(entry.starts_at) &&
    window.endsAt.getTime() === Date.parse(entry.ends_at)
  );
}

// Both times when the admin changed the date or a time field of an entry the form shows
// exactly (`timesEditable`), so the stored window is the form's; none otherwise.
export function editRequest(
  values: FormValues,
  entry: Pick<Location, "truck_id" | "starts_at" | "ends_at">,
): EntryRequest {
  const body: Record<string, unknown> = {};
  if (values.place) {
    const place = placeOf(values.place);
    if (!place) return { ok: false, error: FORM_ERRORS.place };
    Object.assign(body, place);
  }
  const filled = formFromEntry(entry);
  const timesChanged =
    values.date !== filled.date || values.start !== filled.start || values.end !== filled.end;
  if (!timesChanged || !timesEditable(entry)) return { ok: true, body };

  const window = windowOf(values);
  if ("error" in window) return { ok: false, error: window.error };
  body.starts_at = window.startsAt.toISOString();
  body.ends_at = window.endsAt.toISOString();
  return { ok: true, body };
}

// "igår", "idag", "imorgon" or the date, for the day `date` falls on.
function dayText(date: string, now: Date): string {
  const offset = (dayOf(date) ?? 0) - stockholmDay(now);
  return offset === -1 ? "igår" : offset === 0 ? "idag" : offset === 1 ? "imorgon" : date;
}

// "idag 11:00–13:00", "imorgon 22:00–02:00 (slutar dagen efter)", "2026-08-25 11:00–13:00".
export function entryTimeText(entry: Pick<Location, "starts_at" | "ends_at">, now: Date): string {
  const start = stockholmWallClock(new Date(entry.starts_at));
  const end = stockholmWallClock(new Date(entry.ends_at));
  const nextDay = end.date !== start.date ? " (slutar dagen efter)" : "";
  return `${dayText(start.date, now)} ${start.time}–${end.time}${nextDay}`;
}

// "Uppdaterad idag 09:12", or with "igår" or the date for an older one.
export function updatedText(updatedAt: string, now: Date): string {
  const at = stockholmWallClock(new Date(updatedAt));
  return `Uppdaterad ${dayText(at.date, now)} ${at.time}`;
}
