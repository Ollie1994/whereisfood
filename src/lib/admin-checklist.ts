import { CHANGE_THIS_ENTRY } from "@/lib/admin-list";
import type { Checklist, Suggestion } from "@/lib/services/checklist";
import { dayOf, stockholmDay } from "@/lib/stockholm";
import { isTimestamp } from "@/lib/timestamp";

// The morning checklist's pure parts: the answer's check, ✓'s request, ✗'s storage, the
// texts. No clock and no fetch; `useChecklist` holds the state and the requests.

export const CHECKLIST_EMPTY = "Inga förslag idag.";

// `/api/admin/checklist`'s answer, or null when it isn't one.
export function checklistOf(value: unknown): Checklist | null {
  if (typeof value !== "object" || value === null) return null;
  const { day, suggestions } = value as Checklist;
  if (typeof day !== "string" || dayOf(day) === null || !Array.isArray(suggestions)) return null;
  const valid = suggestions.every((item: unknown) => {
    if (typeof item !== "object" || item === null) return false;
    const s = item as Suggestion;
    return (
      typeof s.truck_id === "string" &&
      typeof s.truck_name === "string" &&
      Number.isFinite(s.latitude) &&
      Number.isFinite(s.longitude) &&
      (s.label === null || typeof s.label === "string") &&
      isTimestamp(s.starts_at) &&
      isTimestamp(s.ends_at) &&
      typeof s.from_id === "string" &&
      isTimestamp(s.from_starts_at)
    );
  });
  return valid ? { day, suggestions } : null;
}

// ✓: the body of the ordinary create, `POST /api/admin/locations` (plan #20).
export function confirmBody({ truck_id, latitude, longitude, label, starts_at, ends_at }: Suggestion) {
  return { truck_id, latitude, longitude, label, starts_at, ends_at };
}

// "Förra veckan", "För 3 veckor sedan": how long ago the entry a suggestion came from was,
// counted from the checklist's day.
export function fromText(suggestion: Pick<Suggestion, "from_starts_at">, day: string): string {
  const today = dayOf(day);
  const weeks = today === null ? 0 : Math.round((today - stockholmDay(new Date(suggestion.from_starts_at))) / 7);
  return weeks <= 1 ? "Förra veckan" : `För ${weeks} veckor sedan`;
}

// Whether a checklist read's day, the server's, is before the Stockholm day of the screen's
// clock `now`: the read crossed midnight, or one clock is off. A day ahead of it isn't.
export function isBehind(checklist: Pick<Checklist, "day"> | null, now: Date): boolean {
  const readDay = checklist === null ? null : dayOf(checklist.day);
  return readDay !== null && readDay < stockholmDay(now);
}

// A suggestion a ✓ created, and the newest checklist read sent when it did (`useChecklist`).
export type Confirmed = { id: string; after: number };

// The ✓-created suggestions still to hide once read `readId` applies: those created after it
// was sent, since that read may predate the entry. A read sent later drops them, as the
// server leaves them out by then (they overlap the entry the ✓ made).
export function stillHidden(confirmed: readonly Confirmed[], readId: number): Confirmed[] {
  return confirmed.filter(({ after }) => after >= readId);
}

// What a ✓'s refusal says in place of `CHANGE_THIS_ENTRY` (IS #274, the owner's wording).
export const USE_THE_FORM = " Lägg in en annan tid med formuläret.";

// A ✓'s refusal as the checklist shows it: a ✓ has no time to change, so a 409's advice to
// change this entry's time (`OVERLAP_ADVICE`'s `ended` and `running`) becomes advice to use
// the form. Any other error, and any other status, is shown as it came.
export function checklistRefusal(error: string, status: number | undefined): string {
  if (status !== 409 || !error.endsWith(CHANGE_THIS_ENTRY)) return error;
  return error.slice(0, -CHANGE_THIS_ENTRY.length) + USE_THE_FORM;
}

// ✗ hides a suggestion on this device for the checklist's day (plan #20): its `from_id`, under
// one key holding that day alone, so a new day starts empty and old days don't pile up.
export const DISMISSED_KEY = "wif-checklist-dismissed";

type Store = Pick<Storage, "getItem" | "setItem">;

// The ids hidden on `day`. A getter, not the store: reading `window.localStorage` itself
// throws when site data is blocked. Any failure, or what another day stored, reads as none.
export function readDismissed(store: () => Store, day: string): string[] {
  try {
    const raw = store().getItem(DISMISSED_KEY);
    if (raw === null) return [];
    const stored: unknown = JSON.parse(raw);
    if (typeof stored !== "object" || stored === null) return [];
    const { day: storedDay, ids } = stored as { day?: unknown; ids?: unknown };
    if (storedDay !== day || !Array.isArray(ids)) return [];
    return ids.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

// Stores the ids hidden on `day`. A failure is dropped: the hook still hides them until the
// screen is opened again.
export function writeDismissed(store: () => Store, day: string, ids: readonly string[]): void {
  try {
    store().setItem(DISMISSED_KEY, JSON.stringify({ day, ids }));
  } catch {
    // Nothing stored; see above.
  }
}
