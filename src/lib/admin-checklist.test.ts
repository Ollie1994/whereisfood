import { describe, expect, it } from "vitest";
import {
  DISMISSED_KEY,
  checklistOf,
  confirmBody,
  fromText,
  readDismissed,
  stillHidden,
  writeDismissed,
} from "@/lib/admin-checklist";
import type { Suggestion } from "@/lib/services/checklist";

const SUGGESTION: Suggestion = {
  truck_id: "11111111-1111-4111-8111-111111111111",
  truck_name: "Burgarbilen",
  latitude: 57.7043702,
  longitude: 11.9697598,
  label: "Kungsportsplatsen",
  starts_at: "2026-08-26T09:00:00.000Z",
  ends_at: "2026-08-26T12:00:00.000Z",
  from_id: "22222222-2222-4222-8222-222222222222",
  from_starts_at: "2026-08-19T09:00:00+00:00",
};

// A store in memory, or one whose every call throws, as a blocked `localStorage` does.
function memory(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    store: () => ({
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
    }),
  };
}
const blocked = () => {
  throw new Error("SecurityError");
};
const throwing = () => ({
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
});

describe("checklistOf", () => {
  it("takes the route's answer", () => {
    expect(checklistOf({ day: "2026-08-26", suggestions: [SUGGESTION] })).toEqual({
      day: "2026-08-26",
      suggestions: [SUGGESTION],
    });
    expect(checklistOf({ day: "2026-08-26", suggestions: [{ ...SUGGESTION, label: null }] })).not.toBeNull();
  });

  it.each([
    ["null", null],
    ["no day", { suggestions: [] }],
    ["a malformed day", { day: "26/8", suggestions: [] }],
    ["no list", { day: "2026-08-26" }],
    ["a suggestion missing its from_id", { day: "2026-08-26", suggestions: [{ ...SUGGESTION, from_id: undefined }] }],
    ["a time that isn't a timestamp", { day: "2026-08-26", suggestions: [{ ...SUGGESTION, starts_at: "11:00" }] }],
    ["a coordinate that isn't a number", { day: "2026-08-26", suggestions: [{ ...SUGGESTION, latitude: "57.7" }] }],
  ])("refuses %s", (_, value) => {
    expect(checklistOf(value)).toBeNull();
  });
});

describe("confirmBody", () => {
  it("is the create's body: the truck, place and times, nothing about where it came from", () => {
    expect(confirmBody(SUGGESTION)).toEqual({
      truck_id: SUGGESTION.truck_id,
      latitude: SUGGESTION.latitude,
      longitude: SUGGESTION.longitude,
      label: SUGGESTION.label,
      starts_at: SUGGESTION.starts_at,
      ends_at: SUGGESTION.ends_at,
    });
  });
});

describe("fromText", () => {
  it.each([
    ["2026-08-19T09:00:00+00:00", "Förra veckan"],
    ["2026-08-12T09:00:00+00:00", "För 2 veckor sedan"],
    ["2026-07-29T09:00:00+00:00", "För 4 veckor sedan"],
    // 23:30 Stockholm on 07-29: counted by Stockholm day, not by hours.
    ["2026-07-29T21:30:00+00:00", "För 4 veckor sedan"],
  ])("%s → %s", (from, text) => {
    expect(fromText({ from_starts_at: from }, "2026-08-26")).toBe(text);
  });

  it("counts Stockholm days across the spring change", () => {
    // Monday 03-23 11:00 CET, from Monday 03-30.
    expect(fromText({ from_starts_at: "2026-03-23T10:00:00+00:00" }, "2026-03-30")).toBe("Förra veckan");
  });
});

describe("stillHidden", () => {
  const confirmed = [
    { id: "a", after: 3 },
    { id: "b", after: 5 },
  ];

  it("keeps a ✓ made after the read was sent, or while it was the newest", () => {
    expect(stillHidden(confirmed, 3)).toEqual(confirmed);
    expect(stillHidden(confirmed, 5)).toEqual([{ id: "b", after: 5 }]);
  });

  it("drops a ✓ once a read sent after it applies", () => {
    expect(stillHidden(confirmed, 4)).toEqual([{ id: "b", after: 5 }]);
    expect(stillHidden(confirmed, 6)).toEqual([]);
  });
});

describe("readDismissed / writeDismissed", () => {
  it("reads back what was written for the same day", () => {
    const { store } = memory();
    writeDismissed(store, "2026-08-26", ["a", "b"]);
    expect(readDismissed(store, "2026-08-26")).toEqual(["a", "b"]);
  });

  it("reads none for another day, and a write for a new day replaces the old", () => {
    const { store, items } = memory();
    writeDismissed(store, "2026-08-25", ["a"]);
    expect(readDismissed(store, "2026-08-26")).toEqual([]);

    writeDismissed(store, "2026-08-26", ["b"]);
    expect([...items.keys()]).toEqual([DISMISSED_KEY]);
    expect(readDismissed(store, "2026-08-25")).toEqual([]);
  });

  it.each([
    ["nothing stored", {}],
    ["text that isn't JSON", { [DISMISSED_KEY]: "{" }],
    ["JSON null", { [DISMISSED_KEY]: "null" }],
    ["ids that aren't a list", { [DISMISSED_KEY]: JSON.stringify({ day: "2026-08-26", ids: "a" }) }],
  ])("reads none from %s", (_, initial) => {
    expect(readDismissed(memory(initial).store, "2026-08-26")).toEqual([]);
  });

  it("keeps only the string ids", () => {
    const { store } = memory({ [DISMISSED_KEY]: JSON.stringify({ day: "2026-08-26", ids: ["a", 1, null, "b"] }) });
    expect(readDismissed(store, "2026-08-26")).toEqual(["a", "b"]);
  });

  it("tolerates a store that throws, or a getter that throws, with none read and no throw on a write", () => {
    expect(readDismissed(blocked, "2026-08-26")).toEqual([]);
    expect(readDismissed(throwing, "2026-08-26")).toEqual([]);
    expect(() => writeDismissed(blocked, "2026-08-26", ["a"])).not.toThrow();
    expect(() => writeDismissed(throwing, "2026-08-26", ["a"])).not.toThrow();
  });
});
