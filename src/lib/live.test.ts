import { describe, expect, it } from "vitest";
import {
  diffMarkers,
  freshnessText,
  hoursText,
  isLiveEntry,
  isLiveResponse,
  markerFor,
  statusText,
  todaysEntries,
  type LiveEntry,
  type MarkerEntry,
} from "@/lib/live";

// Timestamps are written with their Stockholm offset (+01:00 CET, +02:00 CEST) so a
// case reads in local time; the code under test compares instants either way. 2026's
// DST days: 03-29 (02:00 CET → 03:00 CEST) and 10-25 (03:00 CEST → 02:00 CET).

function entry(overrides: Partial<LiveEntry> = {}): LiveEntry {
  return {
    id: "entry-1",
    truck: {
      id: "truck-1",
      name: "Tacobilen",
      instagram_handle: "tacobilen",
      cuisine_type: "Mexikanskt",
    },
    latitude: 57.6997,
    longitude: 11.9515,
    label: "Järntorget",
    starts_at: "2026-10-31T10:00:00+00:00",
    ends_at: "2026-10-31T13:00:00+00:00",
    updated_at: "2026-10-31T07:12:00.123456+00:00",
    ...overrides,
  };
}

// The id wins over a `truck` in `overrides`, so a second truck stays a second truck.
function truck(id: string, overrides: Partial<LiveEntry> = {}): LiveEntry {
  return entry({ id: `${id}-entry`, ...overrides, truck: { ...entry().truck, ...overrides.truck, id } });
}

const at = (iso: string) => new Date(iso);

describe("isLiveResponse", () => {
  it("accepts an empty list", () => {
    expect(isLiveResponse({ entries: [] })).toBe(true);
  });

  it("accepts a full entry", () => {
    expect(isLiveResponse({ entries: [entry()] })).toBe(true);
  });

  it("accepts null label, instagram_handle and cuisine_type", () => {
    const e = entry({ label: null, truck: { ...entry().truck, instagram_handle: null, cuisine_type: null } });
    expect(isLiveResponse({ entries: [e] })).toBe(true);
  });

  it.each([
    ["without fractional seconds", "2026-10-31T09:00:00+00:00"],
    ["with microseconds", "2026-10-31T05:12:07.123456+00:00"],
    ["with a Z offset", "2026-10-31T09:00:00Z"],
    ["with a non-zero offset", "2026-10-31T10:00:00+01:00"],
    ["with the largest offset the pattern allows", "2026-10-31T10:00:00-23:59"],
  ])("accepts a timestamp %s", (_name, ts) => {
    expect(isLiveResponse({ entries: [entry({ starts_at: ts, ends_at: ts, updated_at: ts })] })).toBe(true);
  });

  it.each([
    [90, 180],
    [-90, -180],
  ])("accepts coordinates on the range's edge (%d, %d)", (latitude, longitude) => {
    expect(isLiveResponse({ entries: [entry({ latitude, longitude })] })).toBe(true);
  });

  it.each([
    ["an error body", { error: "Internal server error" }],
    ["an empty object", {}],
    ["null", null],
    ["a bare array", [entry()]],
    ["entries not an array", { entries: entry() }],
    ["a non-object entry", { entries: ["x"] }],
    ["a null entry", { entries: [null] }],
  ])("rejects %s", (_name, body) => {
    expect(isLiveResponse(body)).toBe(false);
  });

  // Each case breaks one field of an otherwise valid entry. Fields are listed in the
  // order `isLiveEntry` checks them.
  const top = (key: string, value: unknown) => ({ ...entry(), [key]: value });
  const inTruck = (key: string, value: unknown) => ({ ...entry(), truck: { ...entry().truck, [key]: value } });
  const missing = (key: string) => {
    const copy: Record<string, unknown> = { ...entry() };
    delete copy[key];
    return copy;
  };
  const missingInTruck = (key: string) => {
    const copy: Record<string, unknown> = { ...entry().truck };
    delete copy[key];
    return { ...entry(), truck: copy };
  };

  it.each([
    ["truck missing", missing("truck")],
    ["truck null", top("truck", null)],
    ["truck an array", top("truck", [])],
    ["id missing", missing("id")],
    ["id a number", top("id", 1)],
    ["truck.id missing", missingInTruck("id")],
    ["truck.id a number", inTruck("id", 1)],
    ["truck.name missing", missingInTruck("name")],
    ["truck.name null", inTruck("name", null)],
    ["truck.instagram_handle missing", missingInTruck("instagram_handle")],
    ["truck.instagram_handle a number", inTruck("instagram_handle", 1)],
    ["truck.cuisine_type missing", missingInTruck("cuisine_type")],
    ["truck.cuisine_type a number", inTruck("cuisine_type", 1)],
    ["label missing", missing("label")],
    ["label a number", top("label", 1)],
    ["latitude missing", missing("latitude")],
    ["latitude a string", top("latitude", "57.6997")],
    ["latitude NaN", top("latitude", NaN)],
    ["latitude Infinity", top("latitude", Infinity)],
    ["longitude missing", missing("longitude")],
    ["longitude a string", top("longitude", "11.9515")],
    ["longitude -Infinity", top("longitude", -Infinity)],
    // MapLibre's `LngLat` throws on these latitudes.
    ["latitude 90.5", top("latitude", 90.5)],
    ["latitude -90.5", top("latitude", -90.5)],
    ["latitude 1e9", top("latitude", 1e9)],
    ["longitude 180.5", top("longitude", 180.5)],
    ["longitude -180.5", top("longitude", -180.5)],
    ["starts_at missing", missing("starts_at")],
    ["starts_at a number", top("starts_at", 1)],
    ["starts_at \"1\"", top("starts_at", "1")],
    ["starts_at \"2026\"", top("starts_at", "2026")],
    // `TIMESTAMP.test` turns this array into its one string, which matches.
    ["starts_at an array holding a timestamp", top("starts_at", ["2026-10-31T09:00:00+00:00"])],
    ["ends_at missing", missing("ends_at")],
    ["ends_at \"1\"", top("ends_at", "1")],
    ["ends_at \"2026\"", top("ends_at", "2026")],
    ["updated_at missing", missing("updated_at")],
    ["updated_at \"1\"", top("updated_at", "1")],
    ["updated_at \"2026\"", top("updated_at", "2026")],
    ["a timestamp with no time", top("starts_at", "2026-10-31")],
    // `parseISO` reads this in the runtime's own time zone; the pattern refuses it.
    ["a timestamp with no offset", top("starts_at", "2026-10-31T09:00:00")],
    // Matches the pattern; only `isValid(instant(…))` refuses it.
    ["an impossible date", top("starts_at", "2026-02-30T09:00:00+00:00")],
    // `isValid(instant(…))` accepts this one; only the pattern refuses it.
    ["an offset of +24:00", top("starts_at", "2026-10-31T09:00:00+24:00")],
    ["an hour of 24 in starts_at", top("starts_at", "2026-10-31T24:00:00+00:00")],
    ["an hour of 24 in ends_at", top("ends_at", "2026-10-31T24:00:00+00:00")],
    ["an hour of 24 in updated_at", top("updated_at", "2026-10-31T24:00:00+00:00")],
    // The pattern accepts this one; only `isValid(instant(…))` refuses it.
    ["an offset of +01:60", top("starts_at", "2026-10-31T09:00:00+01:60")],
  ])("rejects a body whose one entry has %s", (_name, broken) => {
    expect(isLiveResponse({ entries: [broken] })).toBe(false);
  });

  it("rejects the whole body when one of several entries is bad", () => {
    expect(isLiveResponse({ entries: [entry(), top("id", 1), truck("truck-2")] })).toBe(false);
  });
});

describe("isLiveEntry", () => {
  it("judges one entry, as the service uses it to drop a bad row", () => {
    expect(isLiveEntry(entry())).toBe(true);
    expect(isLiveEntry(entry({ latitude: 91 }))).toBe(false);
  });
});

describe("todaysEntries", () => {
  const now = at("2026-10-31T11:00:00+01:00");

  it("drops an ended entry, including one ending exactly now", () => {
    const ended = entry({ starts_at: "2026-10-31T08:00:00+01:00", ends_at: "2026-10-31T10:59:00+01:00" });
    const endsNow = entry({ starts_at: "2026-10-31T08:00:00+01:00", ends_at: "2026-10-31T11:00:00+01:00" });
    expect(todaysEntries([ended, endsNow], now)).toEqual([]);
  });

  it("keeps an entry starting before the next Stockholm midnight, drops one at or after it", () => {
    const lateTonight = entry({ starts_at: "2026-10-31T23:59:00+01:00", ends_at: "2026-11-01T02:00:00+01:00" });
    const atMidnight = entry({ starts_at: "2026-11-01T00:00:00+01:00", ends_at: "2026-11-01T02:00:00+01:00" });
    const tomorrow = entry({ starts_at: "2026-11-01T11:00:00+01:00", ends_at: "2026-11-01T14:00:00+01:00" });
    expect(todaysEntries([lateTonight, atMidnight, tomorrow], now)).toEqual([lateTonight]);
  });

  it("keeps an entry that started yesterday and is still running", () => {
    const overnight = entry({ starts_at: "2026-10-30T20:00:00+01:00", ends_at: "2026-10-31T12:00:00+01:00" });
    expect(todaysEntries([overnight], now)).toEqual([overnight]);
  });

  it("cuts at Stockholm's midnight when the UTC date is a day behind", () => {
    // 00:30 Stockholm on 11-01 is still 10-31 in UTC.
    const justAfterMidnight = at("2026-11-01T00:30:00+01:00");
    const lunch = entry({ starts_at: "2026-11-01T11:00:00+01:00", ends_at: "2026-11-01T14:00:00+01:00" });
    expect(todaysEntries([lunch], justAfterMidnight)).toEqual([lunch]);
  });

  it("cuts at Stockholm's midnight when the UTC date is still today", () => {
    // 23:30 Stockholm on 10-31 is 22:30 UTC; an entry at 00:15 Stockholm is 23:15 UTC.
    const lateEvening = at("2026-10-31T23:30:00+01:00");
    const afterMidnight = entry({ starts_at: "2026-11-01T00:15:00+01:00", ends_at: "2026-11-01T02:00:00+01:00" });
    expect(todaysEntries([afterMidnight], lateEvening)).toEqual([]);
  });

  it("uses the 23-hour day on 2026-03-29", () => {
    const springNow = at("2026-03-29T10:00:00+02:00");
    const late = entry({ starts_at: "2026-03-29T23:30:00+02:00", ends_at: "2026-03-30T01:00:00+02:00" });
    // Midnight plus 24 h would be 01:00 on 03-30 and keep this one.
    const nextDay = entry({ starts_at: "2026-03-30T00:30:00+02:00", ends_at: "2026-03-30T02:00:00+02:00" });
    expect(todaysEntries([late, nextDay], springNow)).toEqual([late]);
  });

  it("uses the 25-hour day on 2026-10-25", () => {
    // 00:10 CEST, before the change; the plan's step 2 case.
    const fallNow = at("2026-10-25T00:10:00+02:00");
    // Midnight plus 24 h would be 23:00 CET and drop this one.
    const late = entry({ starts_at: "2026-10-25T23:30:00+01:00", ends_at: "2026-10-26T01:00:00+01:00" });
    const nextDay = entry({ starts_at: "2026-10-26T00:00:00+01:00", ends_at: "2026-10-26T02:00:00+01:00" });
    expect(todaysEntries([late, nextDay], fallNow)).toEqual([late]);
  });
});

describe("markerFor", () => {
  const now = at("2026-10-31T12:00:00+01:00");
  const lunch = entry({ id: "lunch", starts_at: "2026-10-31T11:00:00+01:00", ends_at: "2026-10-31T14:00:00+01:00" });
  const dinner = entry({ id: "dinner", starts_at: "2026-10-31T17:00:00+01:00", ends_at: "2026-10-31T20:00:00+01:00" });
  const evening = entry({ id: "evening", starts_at: "2026-10-31T20:00:00+01:00", ends_at: "2026-10-31T22:00:00+01:00" });
  const breakfast = entry({ id: "breakfast", starts_at: "2026-10-31T07:00:00+01:00", ends_at: "2026-10-31T10:00:00+01:00" });

  it("picks the open entry over a later one, in either order", () => {
    expect(markerFor([dinner, lunch], now).get("truck-1")).toEqual({ entry: lunch, status: "open" });
    expect(markerFor([lunch, dinner], now).get("truck-1")).toEqual({ entry: lunch, status: "open" });
  });

  it("picks the earliest of two later entries, in either order", () => {
    expect(markerFor([evening, dinner], now).get("truck-1")).toEqual({ entry: dinner, status: "later" });
    expect(markerFor([dinner, evening], now).get("truck-1")).toEqual({ entry: dinner, status: "later" });
  });

  it("gives no marker for a truck with only ended entries", () => {
    expect(markerFor([breakfast], now).size).toBe(0);
  });

  it("gives no marker for an entry starting tomorrow (the response runs to now + 26 h)", () => {
    const tomorrow = entry({ starts_at: "2026-11-01T11:00:00+01:00", ends_at: "2026-11-01T14:00:00+01:00" });
    expect(markerFor([tomorrow], now).size).toBe(0);
  });

  it("marks an entry starting exactly now as open", () => {
    expect(markerFor([lunch], at("2026-10-31T11:00:00+01:00")).get("truck-1")?.status).toBe("open");
  });

  it("gives one marker per truck", () => {
    const other = truck("truck-2", { starts_at: lunch.starts_at, ends_at: lunch.ends_at });
    const markers = markerFor([lunch, dinner, other], now);
    expect([...markers.keys()].sort()).toEqual(["truck-1", "truck-2"]);
  });
});

describe("diffMarkers", () => {
  const open = (e: LiveEntry): MarkerEntry => ({ entry: e, status: "open" });
  const byTruck = (...markers: MarkerEntry[]) => new Map(markers.map((m) => [m.entry.truck.id, m]));
  const base = open(entry());

  it("adds a truck that is new", () => {
    const added = open(truck("truck-2"));
    expect(diffMarkers(byTruck(base), byTruck(base, added))).toEqual({ add: [added], update: [], remove: [] });
  });

  it("removes a truck that is gone", () => {
    expect(diffMarkers(byTruck(base), byTruck())).toEqual({ add: [], update: [], remove: ["truck-1"] });
  });

  it("gives an empty diff when nothing changed, for equal but distinct objects", () => {
    expect(diffMarkers(byTruck(base), byTruck(open(entry())))).toEqual({ add: [], update: [], remove: [] });
  });

  it("adds every marker from an empty prev", () => {
    const second = open(truck("truck-2"));
    expect(diffMarkers(byTruck(), byTruck(base, second))).toEqual({ add: [base, second], update: [], remove: [] });
  });

  it("updates on a change of status", () => {
    const later: MarkerEntry = { ...base, status: "later" };
    expect(diffMarkers(byTruck(base), byTruck(later))).toEqual({ add: [], update: [later], remove: [] });
  });

  // One field changed per case; a real edit also moves `updated_at`, which would hide a
  // missing comparison of the field itself.
  it.each<[string, Partial<LiveEntry>]>([
    ["entry id", { id: "entry-2" }],
    ["latitude", { latitude: 57.7075 }],
    ["longitude", { longitude: 11.9386 }],
    ["label", { label: "Lindholmen" }],
    ["starts_at", { starts_at: "2026-10-31T10:30:00+00:00" }],
    ["ends_at", { ends_at: "2026-10-31T13:30:00+00:00" }],
    ["updated_at", { updated_at: "2026-10-31T08:00:00+00:00" }],
    ["truck name", { truck: { ...entry().truck, name: "Tacobussen" } }],
    ["truck cuisine_type", { truck: { ...entry().truck, cuisine_type: null } }],
    ["truck instagram_handle", { truck: { ...entry().truck, instagram_handle: "tacobussen" } }],
  ])("updates on a change of %s", (_name, change) => {
    const changed = open(entry(change));
    expect(diffMarkers(byTruck(base), byTruck(changed))).toEqual({ add: [], update: [changed], remove: [] });
  });
});

describe("text helpers", () => {
  describe("hoursText", () => {
    it("gives Stockholm start–end for an entry within today", () => {
      expect(hoursText(entry(), at("2026-10-31T12:00:00+01:00"))).toBe("11:00–14:00");
    });

    it.each([
      ["started yesterday", "2026-10-30T20:00:00+01:00", "2026-10-31T12:00:00+01:00", "igår 20:00–12:00 idag"],
      ["started yesterday morning, still open", "2026-10-30T08:00:00+01:00", "2026-10-31T12:00:00+01:00", "igår 08:00–12:00 idag"],
      ["started yesterday, open until tonight", "2026-10-30T20:00:00+01:00", "2026-11-01T00:00:00+01:00", "igår 20:00–24:00 idag"],
      ["ends tomorrow", "2026-10-31T23:00:00+01:00", "2026-11-01T02:00:00+01:00", "23:00–02:00 imorgon"],
      ["started yesterday and ends tomorrow", "2026-10-30T20:00:00+01:00", "2026-11-01T02:00:00+01:00", "igår 20:00–02:00 imorgon"],
      ["ends at midnight", "2026-10-31T20:00:00+01:00", "2026-11-01T00:00:00+01:00", "20:00–24:00"],
      ["ends at the midnight after tomorrow", "2026-10-31T20:00:00+01:00", "2026-11-02T00:00:00+01:00", "20:00–24:00 imorgon"],
      ["ends just after a midnight", "2026-10-31T20:00:00+01:00", "2026-11-02T00:00:00.5+01:00", "20:00–00:00 2 nov"],
      ["ends at the midnight after 2 nov", "2026-10-31T20:00:00+01:00", "2026-11-03T00:00:00+01:00", "20:00–24:00 2 nov"],
      ["started two days ago", "2026-10-29T20:00:00+01:00", "2026-10-31T12:00:00+01:00", "29 okt 20:00–12:00 idag"],
      ["ends the day after tomorrow", "2026-10-31T20:00:00+01:00", "2026-11-02T02:00:00+01:00", "20:00–02:00 2 nov"],
    ])("names the other day when the entry %s", (_name, starts_at, ends_at, text) => {
      expect(hoursText(entry({ starts_at, ends_at }), at("2026-10-31T11:00:00+01:00"))).toBe(text);
    });

    it("keeps an entry open just after midnight on today", () => {
      const e = entry({ starts_at: "2026-10-30T20:00:00+01:00", ends_at: "2026-10-31T00:00:30+01:00" });
      expect(hoursText(e, at("2026-10-31T00:00:10+01:00"))).toBe("igår 20:00–00:00 idag");
    });

    it("gives the year of a day in another year", () => {
      const e = entry({ starts_at: "2026-12-31T20:00:00+01:00", ends_at: "2027-01-05T02:00:00+01:00" });
      expect(hoursText(e, at("2026-12-31T21:00:00+01:00"))).toBe("20:00–02:00 5 jan 2027");
    });

    it("names yesterday across the 10-25 change", () => {
      const e = entry({ starts_at: "2026-10-24T20:00:00+02:00", ends_at: "2026-10-25T12:00:00+01:00" });
      expect(hoursText(e, at("2026-10-25T11:00:00+01:00"))).toBe("igår 20:00–12:00 idag");
    });
  });

  it("reads a timestamp with parseISO, as todaysEntries does", () => {
    // Hour 24 is refused by the guard; date-fns-tz's own parser reads it a day earlier.
    expect(freshnessText("2026-10-30T24:00:00+00:00", at("2026-10-31T12:00:00+01:00"))).toBe("Uppdaterad 01:00");
  });

  it("statusText says open, or when it opens in Stockholm time", () => {
    expect(statusText({ entry: entry(), status: "open" })).toBe("Öppet nu");
    const dinner = entry({ starts_at: "2026-10-31T16:00:00+00:00", ends_at: "2026-10-31T19:00:00+00:00" });
    expect(statusText({ entry: dinner, status: "later" })).toBe("Öppnar 17:00");
  });

  describe("freshnessText", () => {
    // A Saturday.
    const now = at("2026-10-31T12:00:00+01:00");

    it("today: the time only", () => {
      expect(freshnessText("2026-10-31T07:12:00.123456+00:00", now)).toBe("Uppdaterad 08:12");
    });

    it("today in Stockholm though yesterday in UTC: the time only", () => {
      expect(freshnessText("2026-10-30T23:30:00+00:00", now)).toBe("Uppdaterad 00:30");
    });

    it("an update on a later Stockholm day than now (a client clock behind the server's): the time only", () => {
      expect(freshnessText("2026-11-01T00:01:00+01:00", at("2026-10-31T23:59:00+01:00"))).toBe("Uppdaterad 00:01");
    });

    it("yesterday: igår", () => {
      expect(freshnessText("2026-10-30T17:30:00+00:00", now)).toBe("Uppdaterad igår 18:30");
    });

    it("yesterday by a minute across Stockholm midnight: igår", () => {
      expect(freshnessText("2026-10-30T23:59:00+01:00", at("2026-10-31T00:01:00+01:00"))).toBe(
        "Uppdaterad igår 23:59",
      );
    });

    it.each([
      ["2026-10-29T09:14:00+01:00", "Uppdaterad i torsdags 09:14"],
      ["2026-10-28T09:14:00+01:00", "Uppdaterad i onsdags 09:14"],
      ["2026-10-27T09:14:00+01:00", "Uppdaterad i tisdags 09:14"],
      ["2026-10-26T09:14:00+01:00", "Uppdaterad i måndags 09:14"],
      // Six days back, the day of the 10-25 change (09:14 is after it, CET).
      ["2026-10-25T09:14:00+01:00", "Uppdaterad i söndags 09:14"],
    ])("two to six days back: the weekday (%s)", (updatedAt, text) => {
      expect(freshnessText(updatedAt, now)).toBe(text);
    });

    it.each([
      ["2026-10-30T09:14:00+01:00", "Uppdaterad i fredags 09:14"],
      ["2026-10-31T09:14:00+01:00", "Uppdaterad i lördags 09:14"],
    ])("the remaining weekdays, from a later now (%s)", (updatedAt, text) => {
      expect(freshnessText(updatedAt, at("2026-11-02T12:00:00+01:00"))).toBe(text);
    });

    it("seven days back: the date", () => {
      expect(freshnessText("2026-10-24T09:14:00+02:00", now)).toBe("Uppdaterad 24 okt 09:14");
    });

    it.each([
      ["2026-01-05", "jan"],
      ["2026-02-05", "feb"],
      ["2026-03-05", "mars"],
      ["2026-04-05", "apr"],
      ["2026-05-05", "maj"],
      ["2026-06-05", "juni"],
      ["2026-07-05", "juli"],
      ["2026-08-05", "aug"],
      ["2026-09-05", "sep"],
      ["2026-10-05", "okt"],
    ])("the month name (%s)", (date, month) => {
      expect(freshnessText(`${date}T12:00:00+00:00`, now)).toMatch(new RegExp(`^Uppdaterad 5 ${month} \\d{2}:00$`));
    });

    it.each([
      ["2026-11-05", "nov"],
      ["2026-12-05", "dec"],
    ])("the month name (%s), from the next year", (date, month) => {
      expect(freshnessText(`${date}T12:00:00+01:00`, at("2027-12-31T12:00:00+01:00"))).toBe(
        `Uppdaterad 5 ${month} 2026 12:00`,
      );
    });

    it("another year: the year after the date", () => {
      expect(freshnessText("2025-12-20T08:00:00+00:00", at("2026-01-10T12:00:00+01:00"))).toBe(
        "Uppdaterad 20 dec 2025 09:00",
      );
    });
  });
});
