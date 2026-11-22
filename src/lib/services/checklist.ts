import { hasEnded } from "@/lib/admin-list";
import { findLocationsOverlapping } from "@/lib/db/locations";
import { listActiveTrucks } from "@/lib/db/trucks";
import { entryWallTimes, entryWindow, stockholmDay, stockholmMidnight, stockholmWallClock } from "@/lib/stockholm";
import type { Location } from "@/lib/types";

// The morning checklist (Phase 7 plan, #20, #22): what each active truck did on this weekday
// recently, moved to today, for the admin to confirm (✓, an ordinary create) or dismiss (✗,
// on the device only). No HTTP, and the clock comes in as `now` (`CLAUDE.md`, "Time").

// How many weeks back the checklist looks, one day window per week (#22).
export const LOOK_BACK_WEEKS = 4;

// A suggestion: a past entry's truck, place and wall-clock times on today's date, and which
// entry it came from. `from_id` is what ✗ hides it by; `from_starts_at` is that entry's start,
// so the admin can see how old it is.
export type Suggestion = Pick<Location, "truck_id" | "latitude" | "longitude" | "label" | "starts_at" | "ends_at"> & {
  truck_name: string;
  from_id: string;
  from_starts_at: string;
};

export type Checklist = { day: string; suggestions: Suggestion[] };

// `entry`'s wall-clock times on Stockholm day `day`, through `entryWindow`, so an end at or
// before the start lands on the next day (#30). Null for an entry `entryWallTimes` can't
// read times from (which the form can't show either, `timesEditable`), and for a time
// today doesn't have (02:30 on 2026-03-29).
function movedTo(entry: Location, day: number): { startsAt: Date; endsAt: Date } | null {
  const times = entryWallTimes(new Date(entry.starts_at), new Date(entry.ends_at));
  return times && entryWindow(day, times.start, times.end);
}

const overlaps = (a: Pick<Location, "starts_at" | "ends_at">, b: Pick<Location, "starts_at" | "ends_at">) =>
  Date.parse(a.starts_at) < Date.parse(b.ends_at) && Date.parse(b.starts_at) < Date.parse(a.ends_at);

// For each active truck, in `listActiveTrucks`' order: of this weekday in the last
// `LOOK_BACK_WEEKS` weeks, the most recent day it had a live entry starting that day, and
// all of that day's entries, so lunch and dinner both show, each by start (#22). The day
// windows are whole Stockholm days back from `stockholmDay(now)`, never `now - 7 × 24 h`
// (#31). Left out: a suggestion already ended, one overlapping a live entry the truck has
// now, and one whose times `movedTo` can't move.
//
// Limits: a truck that cancelled today can be suggested again, since cancelled rows aren't
// read (#22); ✗ hides it. When none of the most recent day's entries can be moved, the
// truck gets no suggestion, and an older week isn't tried. That is an entry the form can't
// show either (`entryWallTimes` lists them; one only the API can write, such as 02:30 CEST
// on 2026-10-25, is among them even when today has that time once), or one at a time today
// doesn't have. Each week's window reads every truck's rows through
// `findLocationsOverlapping`, which throws past `MAX_ROWS` in one day, the same wall as
// `listAdminEntries`' 14 days.
export async function getChecklist(now: Date): Promise<Checklist> {
  const today = stockholmDay(now);
  const day = stockholmWallClock(now).date;

  // Together: the week reads don't depend on the trucks.
  const pastDays = Array.from({ length: LOOK_BACK_WEEKS }, (_, week) => today - 7 * (week + 1));
  const [trucks, ...weeks] = await Promise.all([
    listActiveTrucks(),
    ...pastDays.map(async (pastDay) => {
      const rows = await findLocationsOverlapping(
        stockholmMidnight(pastDay).toISOString(),
        stockholmMidnight(pastDay + 1).toISOString(),
      );
      // A row overlapping the window from the day before didn't start that day.
      return rows.filter((row) => stockholmDay(new Date(row.starts_at)) === pastDay);
    }),
  ]);

  const moved: Suggestion[] = [];
  for (const truck of trucks) {
    const latest = weeks.map((rows) => rows.filter((row) => row.truck_id === truck.id)).find((rows) => rows.length > 0);
    for (const entry of latest ?? []) {
      const window = movedTo(entry, today);
      if (!window) continue;
      moved.push({
        truck_id: truck.id,
        truck_name: truck.name,
        latitude: entry.latitude,
        longitude: entry.longitude,
        label: entry.label,
        starts_at: window.startsAt.toISOString(),
        ends_at: window.endsAt.toISOString(),
        from_id: entry.id,
        from_starts_at: entry.starts_at,
      });
    }
  }

  const open = moved.filter((suggestion) => !hasEnded(suggestion, now));
  if (open.length === 0) return { day, suggestions: [] };

  // The live rows across every suggestion's window: one read, not one per truck. A
  // suggestion ends by tomorrow's end (`entryWindow`), so the window spans two days at most.
  const from = new Date(Math.min(...open.map((s) => Date.parse(s.starts_at)))).toISOString();
  const to = new Date(Math.max(...open.map((s) => Date.parse(s.ends_at)))).toISOString();
  const current = await findLocationsOverlapping(from, to);

  return {
    day,
    suggestions: open.filter(
      (suggestion) => !current.some((row) => row.truck_id === suggestion.truck_id && overlaps(row, suggestion)),
    ),
  };
}
