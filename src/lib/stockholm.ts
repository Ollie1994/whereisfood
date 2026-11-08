import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

// Stockholm calendar days and wall-clock times: the one copy of the midnight code, for the
// map (`live.ts`), the admin form and the checklist (Phase 7 plan, #31). No clock: every
// function that needs the time takes it.

export const TZ = "Europe/Stockholm";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

// The Stockholm calendar date of `date`, as a count of days since 1970-01-01. Day
// arithmetic on it is plain integer arithmetic, with no DST in it.
export function stockholmDay(date: Date): number {
  const [y, m, d] = formatInTimeZone(date, TZ, "yyyy-MM-dd").split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

// `day` as `yyyy-MM-dd`.
function isoDate(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

// Midnight in Stockholm at the start of `day`. Not the previous midnight plus 24 h:
// 2026-03-29 is 23 h long and 2026-10-25 is 25 h (`live.test.ts`'s DST cases).
export function stockholmMidnight(day: number): Date {
  return fromZonedTime(`${isoDate(day)}T00:00:00`, TZ);
}

// The Stockholm calendar day `now` falls on, as `[start, end)`.
export function stockholmDayBounds(now: Date): { start: Date; end: Date } {
  const day = stockholmDay(now);
  return { start: stockholmMidnight(day), end: stockholmMidnight(day + 1) };
}

const WALL_CLOCK = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

// `time` ("11:00", as `<input type="time">` gives it) on Stockholm day `day`, in UTC.
// Null for a malformed time, and for one the day doesn't have (02:30 on 2026-03-29). On
// 2026-10-25 a time between 02:00 and 02:59 occurs twice, and this gives the second, CET.
//
// Stockholm is UTC+1 (CET) or UTC+2 (CEST), so the answer is the wall time less one hour
// or less two, whichever reads back as the wall time in Stockholm; tried in that order,
// the later instant comes first. A limit: that holds from 1948 to 2100. Node's zone data,
// sampled every 6 h from 1890, also has +00:53 before 1893 and +03:00 in 1945–1947, where
// this gives null (PR #238). Not `fromZonedTime`: it reads 02:30 on 2026-03-29 as
// 01:30 CET, and which 02:30 on 2026-10-25 it gives depends on the host's own zone, the
// first on a New York or Los Angeles host (date-fns-tz 3.2.0, `process.env.TZ` set
// in-process, PR #238).
export function wallClockToUtc(day: number, time: string): Date | null {
  if (!WALL_CLOCK.test(time)) return null;
  const date = isoDate(day);
  const wall = Date.parse(`${date}T${time}:00Z`);
  const match = [wall - HOUR_MS, wall - 2 * HOUR_MS].find(
    (ms) => formatInTimeZone(ms, TZ, "yyyy-MM-dd HH:mm") === `${date} ${time}`,
  );
  return match === undefined ? null : new Date(match);
}

// A shift from `start` to `end` on Stockholm day `day`. An end at or before the start, as
// wall-clock times, falls on the next day: 22:00–01:00 ends at 01:00 tomorrow (#30). Null
// when either time is null by `wallClockToUtc`.
export function entryWindow(day: number, start: string, end: string): { startsAt: Date; endsAt: Date } | null {
  const startsAt = wallClockToUtc(day, start);
  // `HH:mm` strings compare in time order; a malformed one is null above or below.
  const endsAt = wallClockToUtc(end <= start ? day + 1 : day, end);
  return startsAt && endsAt ? { startsAt, endsAt } : null;
}
