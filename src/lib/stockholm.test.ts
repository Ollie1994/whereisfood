import { describe, expect, it } from "vitest";
import {
  entryWindow,
  stockholmDay,
  stockholmDayBounds,
  stockholmMidnight,
  stockholmWallClock,
  dayOf,
  isWallClock,
  wallClockToUtc,
} from "@/lib/stockholm";

// 2026-03-29 is 23 hours long in Stockholm (02:00 CET → 03:00 CEST) and 2026-10-25 is 25
// (03:00 CEST → 02:00 CET). `live.test.ts` covers the same helpers through the map's code.

const HOUR = 3_600_000;
const day = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000;
const iso = (date: Date | null | undefined) => date?.toISOString() ?? null;

describe("stockholmDay", () => {
  it("is Stockholm's date, not UTC's", () => {
    expect(stockholmDay(new Date("2026-11-08T22:59:59Z"))).toBe(day("2026-11-08"));
    expect(stockholmDay(new Date("2026-11-08T23:00:00Z"))).toBe(day("2026-11-09"));
    expect(stockholmDay(new Date("2026-07-01T21:59:59Z"))).toBe(day("2026-07-01"));
    expect(stockholmDay(new Date("2026-07-01T22:00:00Z"))).toBe(day("2026-07-02"));
  });
});

describe("dayOf and isWallClock", () => {
  it("reads a date input's value as a day number, or null", () => {
    expect(dayOf("1970-01-02")).toBe(1);
    expect(dayOf("")).toBeNull();
    expect(dayOf("2026-13-40")).toBeNull();
    expect(dayOf("10000-01-01")).toBeNull();
  });

  it("takes 00:00 to 23:59 only", () => {
    expect(["00:00", "23:59", "11:00"].every(isWallClock)).toBe(true);
    expect(["24:00", "25:00", "11:60", "1100", ""].some(isWallClock)).toBe(false);
  });
});

describe("stockholmWallClock", () => {
  it.each([
    ["2026-08-22T09:00:00Z", "2026-08-22", "11:00"],
    ["2026-11-08T22:59:00Z", "2026-11-08", "23:59"],
    ["2026-11-08T23:00:00Z", "2026-11-09", "00:00"],
    // Both 02:30s of 2026-10-25, CEST then CET.
    ["2026-10-25T00:30:00Z", "2026-10-25", "02:30"],
    ["2026-10-25T01:30:00Z", "2026-10-25", "02:30"],
    // The validator's last UTC year, which Stockholm reads as year 10000, and its first.
    ["9999-12-31T23:30:00Z", "10000-01-01", "00:30"],
    ["0001-01-01T00:00:00Z", "0001-01-01", "00:53"],
  ])("reads %s as %s %s", (instant, date, time) => {
    expect(stockholmWallClock(new Date(instant))).toEqual({ date, time });
  });
});

describe("stockholmMidnight", () => {
  it.each([
    ["2026-03-29", "2026-03-28T23:00:00.000Z"],
    ["2026-03-30", "2026-03-29T22:00:00.000Z"],
    ["2026-10-25", "2026-10-24T22:00:00.000Z"],
    ["2026-10-26", "2026-10-25T23:00:00.000Z"],
  ])("%s starts at %s", (date, expected) => {
    expect(iso(stockholmMidnight(day(date)))).toBe(expected);
  });

  // What a day's start means, whatever the zone data says about the date: on day `d`, and
  // the millisecond before it on `d - 1`. Checked on every day whose Stockholm offset at
  // 00:00Z differs from the next day's, and the days either side, from 1850 to 2300, found
  // with the test's own `Intl` formatter; and on every day of years 0001, 9999 and 10000,
  // where `Date.parse` and `Date.UTC` once broke the module (PR #238).
  it("is the first instant of its day, on every offset change from 1850 to 2300 and at the year edges", () => {
    const offset = new Intl.DateTimeFormat("en", { timeZone: "Europe/Stockholm", timeZoneName: "longOffset" });
    const offsetOn = (d: number) => offset.formatToParts(d * 86_400_000).find(({ type }) => type === "timeZoneName")?.value;
    const days = new Set<number>();
    let changes = 0;
    for (let d = day("1850-01-01"), previous = offsetOn(d); d <= day("2300-01-01"); d++) {
      const current = offsetOn(d + 1);
      if (current !== previous) {
        changes++;
        for (const near of [d - 1, d, d + 1, d + 2]) days.add(near);
      }
      previous = current;
    }
    for (const [from, to] of [
      ["0001-01-01", "0002-01-01"],
      ["9999-01-01", "+010001-01-01"],
    ]) {
      for (let d = Date.parse(`${from}T00:00:00Z`) / 86_400_000; d < Date.parse(`${to}T00:00:00Z`) / 86_400_000; d++) {
        days.add(d);
      }
    }
    // Node's data has 667 changes in this range (PR #238); a broken scan finds none.
    expect(changes).toBeGreaterThan(600);
    expect(days.size).toBeGreaterThan(3_000);
    const wrong = [...days].filter((d) => {
      const midnight = stockholmMidnight(d);
      return stockholmDay(midnight) !== d || stockholmDay(new Date(midnight.getTime() - 1)) !== d - 1;
    });
    expect(wrong.map((d) => new Date(d * 86_400_000).toISOString().slice(0, 10))).toEqual([]);
  });
});

describe("stockholmDayBounds", () => {
  it("is 24 hours on an ordinary day", () => {
    const { start, end } = stockholmDayBounds(new Date("2026-11-08T12:00:00Z"));
    expect(iso(start)).toBe("2026-11-07T23:00:00.000Z");
    expect(end.getTime() - start.getTime()).toBe(24 * HOUR);
  });

  it("is 23 hours on 2026-03-29", () => {
    const { start, end } = stockholmDayBounds(new Date("2026-03-29T12:00:00Z"));
    expect([iso(start), iso(end)]).toEqual(["2026-03-28T23:00:00.000Z", "2026-03-29T22:00:00.000Z"]);
    expect(end.getTime() - start.getTime()).toBe(23 * HOUR);
  });

  it("is 25 hours on 2026-10-25", () => {
    const { start, end } = stockholmDayBounds(new Date("2026-10-25T12:00:00Z"));
    expect([iso(start), iso(end)]).toEqual(["2026-10-24T22:00:00.000Z", "2026-10-25T23:00:00.000Z"]);
    expect(end.getTime() - start.getTime()).toBe(25 * HOUR);
  });

  it("holds its own midnight and not the next: [start, end)", () => {
    const { start, end } = stockholmDayBounds(new Date("2026-11-07T23:00:00Z"));
    expect(iso(start)).toBe("2026-11-07T23:00:00.000Z");
    expect(iso(stockholmDayBounds(new Date(end.getTime() - 1)).end)).toBe(iso(end));
    expect(iso(stockholmDayBounds(end).start)).toBe(iso(end));
  });
});

describe("wallClockToUtc", () => {
  it("reads the time in CET in winter and CEST in summer", () => {
    expect(iso(wallClockToUtc(day("2026-11-08"), "11:00"))).toBe("2026-11-08T10:00:00.000Z");
    expect(iso(wallClockToUtc(day("2026-07-01"), "11:00"))).toBe("2026-07-01T09:00:00.000Z");
    expect(iso(wallClockToUtc(day("2026-11-08"), "00:00"))).toBe("2026-11-07T23:00:00.000Z");
    expect(iso(wallClockToUtc(day("2026-11-08"), "23:59"))).toBe("2026-11-08T22:59:00.000Z");
  });

  it("on 2026-03-29, reads the times either side of the gap", () => {
    expect(iso(wallClockToUtc(day("2026-03-29"), "01:59"))).toBe("2026-03-29T00:59:00.000Z");
    expect(iso(wallClockToUtc(day("2026-03-29"), "03:00"))).toBe("2026-03-29T01:00:00.000Z");
  });

  // Not 01:30 CET, which date-fns-tz 3.2.0's `fromZonedTime` gives for 02:30 (PR #238).
  it.each(["02:00", "02:30", "02:59"])("on 2026-03-29, gives null for %s, which the day doesn't have", (time) => {
    expect(wallClockToUtc(day("2026-03-29"), time)).toBeNull();
  });

  it("on 2026-10-25, gives the second of a time that occurs twice, in CET", () => {
    expect(iso(wallClockToUtc(day("2026-10-25"), "01:59"))).toBe("2026-10-24T23:59:00.000Z");
    expect(iso(wallClockToUtc(day("2026-10-25"), "02:30"))).toBe("2026-10-25T01:30:00.000Z");
    expect(iso(wallClockToUtc(day("2026-10-25"), "03:00"))).toBe("2026-10-25T02:00:00.000Z");
  });

  // `fromZonedTime` gives the first occurrence on a New York or Los Angeles host, and
  // `formatInTimeZone` is an hour late on the host's own gap day (PR #238). The first five
  // cases' date and time fall in their host's gap. Tokyo and UTC have one offset all of 2026,
  // and Stockholm's gaps are its own, which no wall time falls in, so theirs is an ordinary
  // time.
  //
  // Node reads `process.env.TZ` again when it is assigned, but deleting it leaves the last
  // zone in place (probed, PR #238): the zone is assigned back first, then the variable is
  // put back as it was.
  it.each([
    ["America/New_York", "2026-03-08", "02:30", "2026-03-08T01:30:00.000Z"],
    ["America/Los_Angeles", "2026-03-08", "02:30", "2026-03-08T01:30:00.000Z"],
    ["Australia/Sydney", "2026-10-04", "02:30", "2026-10-04T00:30:00.000Z"],
    ["America/Santiago", "2026-09-06", "00:30", "2026-09-05T22:30:00.000Z"],
    ["America/Havana", "2026-03-08", "00:30", "2026-03-07T23:30:00.000Z"],
    ["Asia/Tokyo", "2026-11-08", "11:00", "2026-11-08T10:00:00.000Z"],
    ["UTC", "2026-11-08", "11:00", "2026-11-08T10:00:00.000Z"],
    ["Europe/Stockholm", "2026-11-08", "11:00", "2026-11-08T10:00:00.000Z"],
  ])("gives the same answers on a host in %s, its gap day %s %s included", (zone, date, time, expected) => {
    const env = process.env.TZ;
    const original = Intl.DateTimeFormat().resolvedOptions().timeZone;
    process.env.TZ = zone;
    try {
      expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(zone);
      expect(iso(wallClockToUtc(day(date), time))).toBe(expected);
      expect(stockholmDay(new Date(expected))).toBe(day(date));
      expect(iso(wallClockToUtc(day("2026-10-25"), "02:30"))).toBe("2026-10-25T01:30:00.000Z");
      expect(iso(wallClockToUtc(day("2026-10-25"), "02:00"))).toBe("2026-10-25T01:00:00.000Z");
      expect(wallClockToUtc(day("2026-03-29"), "02:30")).toBeNull();
      expect(iso(stockholmMidnight(day("2026-10-25")))).toBe("2026-10-24T22:00:00.000Z");
      expect(iso(stockholmMidnight(day(date)))).toBe(iso(wallClockToUtc(day(date), "00:00")));
    } finally {
      process.env.TZ = original;
      if (env === undefined) delete process.env.TZ;
      else process.env.TZ = env;
    }
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(original);
    expect(process.env.TZ).toBe(env);
  });

  it.each(["24:00", "7:00", "11:60", "11:00:00", "", "11.00", " 11:00"])("gives null for %j", (time) => {
    expect(wallClockToUtc(day("2026-11-08"), time)).toBeNull();
  });
});

describe("entryWindow", () => {
  const window = (date: string, start: string, end: string) => {
    const result = entryWindow(day(date), start, end);
    return result && [iso(result.startsAt), iso(result.endsAt)];
  };

  it("keeps an end after the start on the same day", () => {
    expect(window("2026-11-08", "11:00", "13:00")).toEqual(["2026-11-08T10:00:00.000Z", "2026-11-08T12:00:00.000Z"]);
  });

  it("puts an end before the start on the next day (#30)", () => {
    expect(window("2026-11-08", "22:00", "01:00")).toEqual(["2026-11-08T21:00:00.000Z", "2026-11-09T00:00:00.000Z"]);
  });

  it("puts an end equal to the start on the next day: 24 hours", () => {
    expect(window("2026-11-08", "11:00", "11:00")).toEqual(["2026-11-08T10:00:00.000Z", "2026-11-09T10:00:00.000Z"]);
  });

  it("ends at the next midnight for 20:00–00:00", () => {
    expect(window("2026-11-08", "20:00", "00:00")).toEqual(["2026-11-08T19:00:00.000Z", "2026-11-08T23:00:00.000Z"]);
  });

  it("crosses into 2026-03-29: 22:00–03:00 is 4 hours", () => {
    const result = entryWindow(day("2026-03-28"), "22:00", "03:00");
    expect(iso(result?.endsAt)).toBe("2026-03-29T01:00:00.000Z");
    expect(result && result.endsAt.getTime() - result.startsAt.getTime()).toBe(4 * HOUR);
  });

  it("crosses into 2026-10-25: 22:00–03:00 is 6 hours", () => {
    const result = entryWindow(day("2026-10-24"), "22:00", "03:00");
    expect(iso(result?.endsAt)).toBe("2026-10-25T02:00:00.000Z");
    expect(result && result.endsAt.getTime() - result.startsAt.getTime()).toBe(6 * HOUR);
  });

  // `entryWindow`'s stated limit, pinned so a change to it is seen.
  it("reads 02:45–02:15 inside 2026-10-25's repeated hour as 23.5 hours", () => {
    const result = entryWindow(day("2026-10-25"), "02:45", "02:15");
    expect(result && result.endsAt.getTime() - result.startsAt.getTime()).toBe(23.5 * HOUR);
  });

  it("gives null when the next day lacks the end time: 22:00–02:30 from 2026-03-28", () => {
    expect(entryWindow(day("2026-03-28"), "22:00", "02:30")).toBeNull();
  });

  it("gives null when the day lacks the start time, or a time is malformed", () => {
    expect(entryWindow(day("2026-03-29"), "02:30", "04:00")).toBeNull();
    expect(entryWindow(day("2026-11-08"), "x", "13:00")).toBeNull();
    expect(entryWindow(day("2026-11-08"), "11:00", "25:00")).toBeNull();
  });
});
