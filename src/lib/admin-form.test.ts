import { describe, expect, it } from "vitest";
import {
  DEFAULT_END,
  DEFAULT_START,
  FORM_ERRORS,
  SAVED,
  SAVED_LATER,
  createRequest,
  dayOf,
  editRequest,
  emptyForm,
  endsNextDay,
  entryTimeText,
  formFromEntry,
  savedText,
  timesEditable,
  updatedText,
} from "@/lib/admin-form";
import { LIST_DAYS } from "@/lib/admin-list";

const TRUCK = "11111111-1111-1111-1111-111111111111";
// 10:00 Stockholm (CEST) on Saturday 2026-08-22.
const NOW = new Date("2026-08-22T08:00:00.000Z");
const FORM = { truckId: TRUCK, date: "2026-08-22", place: "Järntorget", start: "11:00", end: "13:00" };

describe("emptyForm", () => {
  it("is today in Stockholm, 11–13 (#23), with no truck or place", () => {
    expect(emptyForm(NOW)).toEqual({ truckId: "", date: "2026-08-22", place: "", start: DEFAULT_START, end: DEFAULT_END });
    expect([DEFAULT_START, DEFAULT_END]).toEqual(["11:00", "13:00"]);
  });

  it("is Stockholm's date late in the UTC evening", () => {
    // 00:30 on 2026-11-09 in Stockholm.
    expect(emptyForm(new Date("2026-11-08T23:30:00.000Z")).date).toBe("2026-11-09");
  });
});

describe("dayOf and endsNextDay", () => {
  it("reads a date input's value, or null", () => {
    expect(dayOf("1970-01-02")).toBe(1);
    expect(dayOf("")).toBeNull();
    expect(dayOf("2026-13-40")).toBeNull();
  });

  it("is next-day for an end at or before the start (#30)", () => {
    expect(endsNextDay("22:00", "02:00")).toBe(true);
    expect(endsNextDay("11:00", "11:00")).toBe(true);
    expect(endsNextDay("11:00", "13:00")).toBe(false);
  });
});

describe("createRequest", () => {
  it("sends the spot's place and the Stockholm times in UTC", () => {
    expect(createRequest(FORM)).toEqual({
      ok: true,
      body: {
        truck_id: TRUCK,
        latitude: 57.6998935,
        longitude: 11.952503,
        label: "Järntorget",
        starts_at: "2026-08-22T09:00:00.000Z",
        ends_at: "2026-08-22T11:00:00.000Z",
      },
    });
  });

  it("ends a shift past midnight on the next day, from one date", () => {
    const result = createRequest({ ...FORM, start: "22:00", end: "02:00" });
    expect(result).toMatchObject({
      body: { starts_at: "2026-08-22T20:00:00.000Z", ends_at: "2026-08-23T00:00:00.000Z" },
    });
  });

  it.each([
    ["no truck", { truckId: "" }, FORM_ERRORS.truck],
    ["no place", { place: "" }, FORM_ERRORS.place],
    ["an unknown place", { place: "Ingenstans" }, FORM_ERRORS.place],
    ["no date", { date: "" }, FORM_ERRORS.date],
    ["a time the day doesn't have", { date: "2026-03-29", start: "02:30", end: "04:00" }, FORM_ERRORS.time],
  ])("refuses %s before any request", (_, change, error) => {
    expect(createRequest({ ...FORM, ...change })).toEqual({ ok: false, error });
  });
});

describe("formFromEntry and editRequest", () => {
  const ENTRY = { truck_id: TRUCK, starts_at: "2026-08-22T09:00:00+00:00", ends_at: "2026-08-22T11:00:00+00:00" };

  it("shows an entry's truck, Stockholm date and times, keeping its place", () => {
    expect(formFromEntry(ENTRY)).toEqual({ truckId: TRUCK, date: "2026-08-22", place: "", start: "11:00", end: "13:00" });
  });

  it("sends the place when it changed, and both times when a time changed", () => {
    expect(editRequest({ ...formFromEntry(ENTRY), end: "14:00" }, ENTRY)).toEqual({
      ok: true,
      body: { starts_at: "2026-08-22T09:00:00.000Z", ends_at: "2026-08-22T12:00:00.000Z" },
    });
    expect(editRequest({ ...formFromEntry(ENTRY), place: "Heden" }, ENTRY)).toMatchObject({
      body: { label: "Heden", latitude: expect.any(Number), longitude: expect.any(Number) },
    });
    expect(editRequest(formFromEntry(ENTRY), ENTRY)).toEqual({ ok: true, body: {} });
  });

  // The form holds the start date and minutes; an entry it can't show exactly keeps its
  // times when only the place changes.
  it.each([
    ["longer than a day", { ...ENTRY, ends_at: "2026-08-24T11:00:00+00:00" }],
    ["stored with seconds", { ...ENTRY, starts_at: "2026-08-22T09:00:30+00:00" }],
  ])("leaves the times of an entry %s alone on a place-only edit", (_, entry) => {
    expect(editRequest({ ...formFromEntry(entry), place: "Heden" }, entry)).toEqual({
      ok: true,
      body: { latitude: expect.any(Number), longitude: expect.any(Number), label: "Heden" },
    });
  });

  // Entries the form can't show exactly: an edit of one sends no time.
  it.each([
    ["a two-day entry, start moved", { ...ENTRY, ends_at: "2026-08-24T11:00:00+00:00" }, { start: "10:00" }],
    ["a two-day entry, date moved", { ...ENTRY, ends_at: "2026-08-24T11:00:00+00:00" }, { date: "2026-08-23" }],
    [
      "an entry whose end falls in the DST gap on the form's day",
      { ...ENTRY, starts_at: "2026-03-29T00:00:00+00:00", ends_at: "2026-03-30T00:30:00+00:00" },
      { start: "00:30" },
    ],
  ])("sends no time for %s, which the form can't show exactly", (_, entry, change) => {
    expect(timesEditable(entry)).toBe(false);
    expect(editRequest({ ...formFromEntry(entry), ...change }, entry)).toEqual({ ok: true, body: {} });
  });

  // `timesEditable`'s comment: every entry the form itself creates fits it, so only rows
  // written outside the app show read-only times.
  it.each([
    ["lunch", { start: "11:00", end: "13:00" }],
    ["past midnight", { start: "22:00", end: "02:00" }],
    ["across the spring gap", { date: "2026-03-28", start: "23:00", end: "04:00" }],
    ["in the autumn's repeated hour", { date: "2026-10-25", start: "02:30", end: "05:00" }],
    ["a full day, end equal to start", { start: "11:00", end: "11:00" }],
  ])("finds every entry the form creates editable: %s", (_, change) => {
    const created = createRequest({ ...FORM, ...change });
    if (!created.ok) throw new Error(created.error);
    const { starts_at, ends_at } = created.body as { starts_at: string; ends_at: string };
    expect(timesEditable({ truck_id: TRUCK, starts_at, ends_at })).toBe(true);
  });

  it("edits the times of an entry the form shows exactly, overnight ones included", () => {
    expect(timesEditable(ENTRY)).toBe(true);
    expect(timesEditable({ ...ENTRY, starts_at: "2026-08-22T20:00:00+00:00", ends_at: "2026-08-23T00:00:00+00:00" })).toBe(true);
  });

  // 11–13 with the start moved to 14:00: the form now reads the end as tomorrow's (#30).
  it("sends the end too when the start crosses it", () => {
    expect(editRequest({ ...formFromEntry(ENTRY), start: "14:00" }, ENTRY)).toEqual({
      ok: true,
      body: { starts_at: "2026-08-22T12:00:00.000Z", ends_at: "2026-08-23T11:00:00.000Z" },
    });
  });

  it("sends both when the date changes", () => {
    expect(editRequest({ ...formFromEntry(ENTRY), date: "2026-08-23" }, ENTRY)).toEqual({
      ok: true,
      body: { starts_at: "2026-08-23T09:00:00.000Z", ends_at: "2026-08-23T11:00:00.000Z" },
    });
  });
});

describe("savedText", () => {
  // The list reads today and the next 13 days: 2026-08-22 to 2026-09-04 here.
  it.each([
    ["today", "2026-08-22T09:00:00Z", SAVED],
    ["the list's last day, late", "2026-09-04T21:30:00Z", SAVED],
    ["the day after it, the 15th", "2026-09-05T09:00:00Z", SAVED_LATER],
    ["months ahead", "2027-01-22T10:00:00Z", SAVED_LATER],
  ])("says the list won't show an entry yet only past its 14 days: %s", (_, starts_at, text) => {
    expect(savedText({ starts_at }, NOW)).toBe(text);
  });

  it("keeps LIST_DAYS at #24's 14", () => {
    expect(LIST_DAYS).toBe(14);
  });
});

describe("entryTimeText and updatedText", () => {
  it.each([
    ["2026-08-21T12:51:00Z", "2026-08-22T01:51:00Z", "igår 14:51–03:51 (slutar dagen efter)"],
    ["2026-08-22T09:00:00Z", "2026-08-22T11:00:00Z", "idag 11:00–13:00"],
    ["2026-08-23T20:00:00Z", "2026-08-24T00:00:00Z", "imorgon 22:00–02:00 (slutar dagen efter)"],
    ["2026-08-25T09:00:00Z", "2026-08-25T11:00:00Z", "2026-08-25 11:00–13:00"],
  ])("reads %s–%s as %s", (starts_at, ends_at, text) => {
    expect(entryTimeText({ starts_at, ends_at }, NOW)).toBe(text);
  });

  it.each([
    ["2026-08-22T07:12:00Z", "Uppdaterad idag 09:12"],
    ["2026-08-21T07:12:00Z", "Uppdaterad igår 09:12"],
    ["2026-08-19T07:12:00Z", "Uppdaterad 2026-08-19 09:12"],
  ])("reads updated_at %s as %s", (updatedAt, text) => {
    expect(updatedText(updatedAt, NOW)).toBe(text);
  });
});
