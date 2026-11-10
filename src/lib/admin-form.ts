import { LIST_DAYS } from "@/lib/admin-list";
import { type Pin, samePin } from "@/lib/admin-place";
import type { Place } from "@/lib/services/locations";
import { dayOf, entryWindow, isWallClock, stockholmDay, stockholmWallClock } from "@/lib/stockholm";
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

// What the form holds. `pin` is where the entry stands, null until one is picked; `label`
// is the place's name as filled by a spot or recent place or typed, blank for none.
export type FormValues = {
  truckId: string;
  date: string;
  pin: Pin | null;
  label: string;
  start: string;
  end: string;
};

// What the form reads from an entry it edits.
type EditedEntry = Pick<Location, "truck_id" | "latitude" | "longitude" | "label" | "starts_at" | "ends_at">;

export type EntryRequest = { ok: true; body: Record<string, unknown> } | { ok: false; error: string };

// An end at or before the start, as wall-clock times, falls on the next day (#30).
// Two times only: a field being cleared to type a new one isn't "Slutar imorgon".
export function endsNextDay(start: string, end: string): boolean {
  return isWallClock(start) && isWallClock(end) && end <= start;
}

export function emptyForm(now: Date): FormValues {
  return {
    truckId: "",
    date: stockholmWallClock(now).date,
    pin: null,
    label: "",
    start: DEFAULT_START,
    end: DEFAULT_END,
  };
}

type FormTimes = Pick<FormValues, "date" | "start" | "end">;

// An entry's Stockholm date and times, as the form shows them.
function timesOf(entry: Pick<Location, "starts_at" | "ends_at">): FormTimes {
  const start = stockholmWallClock(new Date(entry.starts_at));
  const end = stockholmWallClock(new Date(entry.ends_at));
  return { date: start.date, start: start.time, end: end.time };
}

// An entry as the form shows it for an edit: its own truck, place, name and times.
export function formFromEntry(entry: EditedEntry): FormValues {
  return {
    truckId: entry.truck_id,
    pin: { latitude: entry.latitude, longitude: entry.longitude },
    label: entry.label ?? "",
    ...timesOf(entry),
  };
}

// The form's place for a known spot or a recent place: its pin and its name.
export function placeValues(place: Place): Pick<FormValues, "pin" | "label"> {
  return { pin: { latitude: place.latitude, longitude: place.longitude }, label: place.label ?? "" };
}

// A blank name is none, as the route reads it (`parseNewLocation`).
const labelOf = (values: FormValues): string | null => values.label.trim() || null;

function windowOf(values: FormTimes): { startsAt: Date; endsAt: Date } | { error: string } {
  const day = dayOf(values.date);
  if (day === null) return { error: FORM_ERRORS.date };
  return entryWindow(day, values.start, values.end) ?? { error: FORM_ERRORS.time };
}

// The body of `POST /api/admin/locations`. The route checks the rest (#33, overlaps).
export function createRequest(values: FormValues): EntryRequest {
  if (!values.truckId) return { ok: false, error: FORM_ERRORS.truck };
  if (!values.pin) return { ok: false, error: FORM_ERRORS.place };
  const window = windowOf(values);
  if ("error" in window) return { ok: false, error: window.error };

  return {
    ok: true,
    body: {
      truck_id: values.truckId,
      latitude: values.pin.latitude,
      longitude: values.pin.longitude,
      label: labelOf(values),
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
// an edit of it changes its place and name alone (`editRequest`). The form's own entries
// always fit, since `entryWindow` ends one within a day of its start.
export function timesEditable(entry: Pick<Location, "starts_at" | "ends_at">): boolean {
  const window = windowOf(timesOf(entry));
  return (
    !("error" in window) &&
    window.startsAt.getTime() === Date.parse(entry.starts_at) &&
    window.endsAt.getTime() === Date.parse(entry.ends_at)
  );
}

// The pin when it moved, the name when it changed, and both times when the admin changed
// the date or a time field of an entry the form shows exactly (`timesEditable`), so the
// stored window is the form's; no times otherwise.
export function editRequest(values: FormValues, entry: EditedEntry): EntryRequest {
  const body: Record<string, unknown> = {};
  if (values.pin && !samePin(values.pin, entry)) {
    body.latitude = values.pin.latitude;
    body.longitude = values.pin.longitude;
  }
  const label = labelOf(values);
  if (label !== entry.label) body.label = label;
  const filled = timesOf(entry);
  const timesChanged =
    values.date !== filled.date || values.start !== filled.start || values.end !== filled.end;
  if (!timesChanged || !timesEditable(entry)) return { ok: true, body };

  const window = windowOf(values);
  if ("error" in window) return { ok: false, error: window.error };
  body.starts_at = window.startsAt.toISOString();
  body.ends_at = window.endsAt.toISOString();
  return { ok: true, body };
}

// "igår", "idag", "imorgon" or the date, for the Stockholm day `instant` falls on. Counted
// with `stockholmDay`, not by parsing the date text: Stockholm's date can have five digits
// (`stockholmWallClock`), which `dayOf` doesn't read.
function dayText(instant: Date, now: Date): string {
  const offset = stockholmDay(instant) - stockholmDay(now);
  if (offset === -1) return "igår";
  if (offset === 0) return "idag";
  if (offset === 1) return "imorgon";
  return stockholmWallClock(instant).date;
}

// "idag 11:00–13:00", "imorgon 22:00–02:00 (slutar dagen efter)", "2026-08-25 11:00–13:00",
// or with the end's day when it falls more than a day after the start's.
export function entryTimeText(entry: Pick<Location, "starts_at" | "ends_at">, now: Date): string {
  const startsAt = new Date(entry.starts_at);
  const endsAt = new Date(entry.ends_at);
  const days = stockholmDay(endsAt) - stockholmDay(startsAt);
  const endTime = stockholmWallClock(endsAt).time;
  const until = days > 1 ? `${dayText(endsAt, now)} ${endTime}` : endTime;
  const nextDay = days === 1 ? " (slutar dagen efter)" : "";
  return `${dayText(startsAt, now)} ${stockholmWallClock(startsAt).time}–${until}${nextDay}`;
}

// "Uppdaterad idag 09:12", or with "igår" or the date for an older one.
export function updatedText(updatedAt: string, now: Date): string {
  const at = new Date(updatedAt);
  return `Uppdaterad ${dayText(at, now)} ${stockholmWallClock(at).time}`;
}
