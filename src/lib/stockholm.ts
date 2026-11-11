// Stockholm calendar days and wall-clock times: the one copy of the midnight code, for the
// map (`live.ts`), the admin form and the checklist (Phase 7 plan, #31). No clock: every
// function that needs the time takes it.

const TZ = "Europe/Stockholm";

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
const SECOND_MS = 1_000;

// Stockholm's wall time through `Intl`, not date-fns-tz 3.2.0's `formatInTimeZone`, which
// rebuilt it with `setHours` in the host's own zone and was an hour late for a wall time
// inside the host's own gap: 2026-03-08 01:30Z read "03:30" on a New York host and "02:30"
// here, and wall times in Sydney's, Santiago's and Havana's gaps were an hour late too
// (`process.env.TZ` set in-process, PR #238).
const STOCKHOLM = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  era: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

// Stockholm's wall time at `instant`, as the UTC milliseconds that read the same. Built
// with `setUTCFullYear`, not a string: `Date.parse` gave NaN for "10000-01-01T00:30:00Z",
// Stockholm's reading of 9999-12-31T23:30Z, and `Date.UTC` maps years 0–99 to 1900–1999.
// `Intl` gives the ISO year 0 as "1" with era "BC" (probed, PR #238).
function wallMs(instant: number): number {
  const part = Object.fromEntries(STOCKHOLM.formatToParts(instant).map(({ type, value }) => [type, value]));
  const year = Number(part.year);
  const wall = new Date(0);
  wall.setUTCFullYear(part.era === "BC" ? 1 - year : year, Number(part.month) - 1, Number(part.day));
  wall.setUTCHours(Number(part.hour), Number(part.minute), Number(part.second), 0);
  return wall.getTime();
}

// Stockholm's offset from UTC at `instant`, to the second: before 1893-04-01 Node's zone
// data has local mean time, +00:53:28, and to the minute a day's start came out 28 s late
// (`stockholm.test.ts`'s 1850–2300 test, PR #238).
function offsetAt(instant: number): number {
  return wallMs(instant) - Math.floor(instant / SECOND_MS) * SECOND_MS;
}

// Every instant that reads as `minutes` past midnight on `day` in Stockholm: none in a gap,
// two in a repeated hour, else one. Stockholm's offsets a day either side of the wall time
// cover any change of offset near it: in Node's zone data from 1850 to 2300 the two closest
// changes are 35 days apart (PR #238).
function wallInstants(day: number, minutes: number): number[] {
  const wall = day * DAY_MS + minutes * MINUTE_MS;
  const offsets = new Set([offsetAt(wall - DAY_MS), offsetAt(wall), offsetAt(wall + DAY_MS)]);
  return [...offsets]
    .map((offset) => wall - offset)
    .filter((ms) => Math.floor(wallMs(ms) / MINUTE_MS) * MINUTE_MS === wall);
}

// `date`'s Stockholm calendar date and clock time, as "2026-08-22" and "11:00", through
// `wallMs`, so no host zone is involved. From the fields, not `toISOString`, which writes
// Stockholm's 10000-01-01 (UTC 9999-12-31T23:30Z, which the validator takes) as
// "+010000-01-01T…" (`new Date(Date.UTC(10000, 0, 1, 0, 30)).toISOString()` in Node). A year
// before 1 keeps its sign ahead of the padding, "-0001-12-31": padded as a number it read
// "00-1-12-31" (PR #252, round 4).
export function stockholmWallClock(date: Date): { date: string; time: string } {
  const wall = new Date(wallMs(date.getTime()));
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  const year = wall.getUTCFullYear();
  return {
    date: `${year < 0 ? "-" : ""}${pad(Math.abs(year), 4)}-${pad(wall.getUTCMonth() + 1)}-${pad(wall.getUTCDate())}`,
    time: `${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}`,
  };
}

// The Stockholm calendar date of `date`, as a count of days since 1970-01-01. Day
// arithmetic on it is plain integer arithmetic, with no DST in it.
export function stockholmDay(date: Date): number {
  return Math.floor(wallMs(date.getTime()) / DAY_MS);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// A calendar date as `<input type="date">` gives it, "2026-08-22", as the day number
// `stockholmDay` counts in; null for anything else.
export function dayOf(date: string): number | null {
  if (!DATE.test(date)) return null;
  const ms = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(ms) ? null : ms / DAY_MS;
}

// The first instant of Stockholm day `day`. Not the previous midnight plus 24 h:
// 2026-03-29 is 23 h long and 2026-10-25 is 25 h (`live.test.ts`'s DST cases). The earlier
// of two midnights, and where a gap ends when midnight falls in one. Node's zone data has
// one of each from 1850 to 2300, 1916-10-01 and 1893-04-01, and one midnight on every
// other day (PR #238). No throw of its own, since the map calls it while rendering; every
// day of years 0001, 9999 and 10000 gave the day's start (PR #238).
export function stockholmMidnight(day: number): Date {
  const midnights = wallInstants(day, 0);
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

// A wall-clock time as `<input type="time">` gives it, "00:00" to "23:59".
export function isWallClock(time: string): boolean {
  return WALL_CLOCK.test(time);
}

// `time` ("11:00", as `<input type="time">` gives it) on Stockholm day `day`, in UTC.
// Null for a malformed time, and for one the day doesn't have (02:30 on 2026-03-29). On
// 2026-10-25 a time between 02:00 and 02:59 occurs twice, and this gives the second, CET.
//
// Through `wallInstants`, so no host zone is involved. Not `fromZonedTime`: it reads
// 02:30 on 2026-03-29 as 01:30 CET, and which 02:30 on 2026-10-25 it gives depends on the
// host's own zone, the first on a New York or Los Angeles host (date-fns-tz 3.2.0, PR #238).
export function wallClockToUtc(day: number, time: string): Date | null {
  if (!WALL_CLOCK.test(time)) return null;
  const instants = wallInstants(day, Number(time.slice(0, 2)) * 60 + Number(time.slice(3)));
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

// The start's Stockholm date and the two wall-clock times that `entryWindow` rebuilds
// [startsAt, endsAt) from exactly; null when it can't. The form shows an entry's times by
// them (`timesEditable`), and the checklist moves an entry to today by them. Null for:
// - an end later than the start's wall time on the next day, which `entryWindow` puts on the
//   start's day (and whose wall time may not exist there, in a DST gap);
// - a time with seconds;
// - a time in the first copy of the hour an autumn change repeats, which `wallClockToUtc`
//   reads as the second (02:30 CEST on 2026-10-25);
// - a start whose date isn't a four-digit year, unsigned (`dayOf`): "10000-…", "-0001-…".
// `entryWindow`'s windows fit, as its end is on the start's day or at or before the start's
// wall time the next, and it gives the second copy of a repeated hour: probed on every day of
// 2026, every start and end at 30-minute steps, 840,769 windows, all read back (PR #249,
// round 2). Not on a day outside a four-digit year, whose date `dayOf` refuses.
export function entryWallTimes(startsAt: Date, endsAt: Date): { date: string; start: string; end: string } | null {
  const start = stockholmWallClock(startsAt);
  const end = stockholmWallClock(endsAt);
  const day = dayOf(start.date);
  const window = day === null ? null : entryWindow(day, start.time, end.time);
  const exact =
    window !== null &&
    window.startsAt.getTime() === startsAt.getTime() &&
    window.endsAt.getTime() === endsAt.getTime();
  return exact ? { date: start.date, start: start.time, end: end.time } : null;
}
