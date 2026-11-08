// Stockholm calendar days and wall-clock times: the one copy of the midnight code, for the
// map (`live.ts`), the admin form and the checklist (Phase 7 plan, #31). No clock: every
// function that needs the time takes it.

export const TZ = "Europe/Stockholm";

const DAY_MS = 86_400_000;
const SECOND_MS = 1_000;

// Stockholm's wall time through `Intl`, not date-fns-tz's `formatInTimeZone`, which
// rebuilds it with `setHours` in the host's own zone and is an hour late on the host's
// gap day: 2026-03-08 01:30Z read "03:30" on a New York host and "02:30" here, as did
// Sydney's, Santiago's and Havana's gap days (`process.env.TZ` set in-process, PR #238).
const STOCKHOLM = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function stockholmParts(instant: Date | number): Record<string, string> {
  return Object.fromEntries(STOCKHOLM.formatToParts(instant).map(({ type, value }) => [type, value]));
}

// `yyyy-MM-dd HH:mm` in Stockholm.
function stockholmWall(instant: Date | number): string {
  const part = stockholmParts(instant);
  return `${part.year.padStart(4, "0")}-${part.month}-${part.day} ${part.hour}:${part.minute}`;
}

// Stockholm's offset from UTC at `instant`, read from `Intl` to the second: before
// 1893-04-01 Node's zone data has local mean time, +00:53:28, and to the minute a day's
// start came out 28 s late (`stockholm.test.ts`'s 1850–2300 test, PR #238).
function offsetAt(instant: number): number {
  const part = stockholmParts(instant);
  const wall = Date.parse(
    `${part.year.padStart(4, "0")}-${part.month}-${part.day}T${part.hour}:${part.minute}:${part.second}Z`,
  );
  return wall - Math.floor(instant / SECOND_MS) * SECOND_MS;
}

// Every instant that reads as `time` on `day` in Stockholm: none in a gap, two in a
// repeated hour, else one. Stockholm's offsets a day either side of the wall time cover
// any change of offset near it: in Node's zone data from 1850 to 2300 the two closest
// changes are 35 days apart (PR #238).
function wallInstants(day: number, time: string): number[] {
  const date = isoDate(day);
  const wall = Date.parse(`${date}T${time}:00Z`);
  const offsets = new Set([offsetAt(wall - DAY_MS), offsetAt(wall), offsetAt(wall + DAY_MS)]);
  return [...offsets].map((offset) => wall - offset).filter((ms) => stockholmWall(ms) === `${date} ${time}`);
}

// The Stockholm calendar date of `date`, as a count of days since 1970-01-01. Day
// arithmetic on it is plain integer arithmetic, with no DST in it.
export function stockholmDay(date: Date): number {
  const [y, m, d] = stockholmWall(date).slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

// `day` as `yyyy-MM-dd`.
function isoDate(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

// The first instant of Stockholm day `day`. Not the previous midnight plus 24 h:
// 2026-03-29 is 23 h long and 2026-10-25 is 25 h (`live.test.ts`'s DST cases). The earlier
// of two midnights, and where a gap ends when midnight falls in one. Node's zone data has
// one of each from 1850 to 2300, 1916-10-01 and 1893-04-01, and one midnight on every
// other day (PR #238). No throw of its own, since the map calls it while rendering. `Intl`
// throws a RangeError past year 9999: 9999-12-31 threw, while every other day of years
// 0001 and 9999 gave the day's start (PR #238). The location validator keeps entries to
// UTC years up to 9998 for this.
export function stockholmMidnight(day: number): Date {
  const midnights = wallInstants(day, "00:00");
  if (midnights.length > 0) return new Date(Math.min(...midnights));
  const wall = day * DAY_MS;
  return new Date(wall - offsetAt(wall - DAY_MS));
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
// Through `wallInstants`, so no host zone is involved. Not `fromZonedTime`: it reads
// 02:30 on 2026-03-29 as 01:30 CET, and which 02:30 on 2026-10-25 it gives depends on the
// host's own zone, the first on a New York or Los Angeles host (date-fns-tz 3.2.0, PR #238).
export function wallClockToUtc(day: number, time: string): Date | null {
  if (!WALL_CLOCK.test(time)) return null;
  const instants = wallInstants(day, time);
  return instants.length > 0 ? new Date(Math.max(...instants)) : null;
}

// A shift from `start` to `end` on Stockholm day `day`. An end at or before the start, as
// wall-clock times, falls on the next day: 22:00–01:00 ends at 01:00 tomorrow (#30). Null
// when either time is null by `wallClockToUtc`. A limit: inside the hour an autumn change
// repeats (02:00–02:59 on the last Sunday of October), 02:45–02:15 means 30 minutes but
// gives 23.5 hours, the end read as the next day's.
export function entryWindow(day: number, start: string, end: string): { startsAt: Date; endsAt: Date } | null {
  const startsAt = wallClockToUtc(day, start);
  // `HH:mm` strings compare in time order; a malformed one is null above or below.
  const endsAt = wallClockToUtc(end <= start ? day + 1 : day, end);
  return startsAt && endsAt ? { startsAt, endsAt } : null;
}
