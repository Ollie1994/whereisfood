import { describe, expect, it } from "vitest";
import {
  DISMISSED_KEY,
  USE_THE_FORM,
  checklistOf,
  checklistRefusal,
  confirmBody,
  fromText,
  isBehind,
  listMayHaveChanged,
  readDismissed,
  stillHidden,
  writeDismissed,
} from "@/lib/admin-checklist";
import { OVERLAP_ADVICE } from "@/lib/admin-list";
import { API_ERRORS } from "@/lib/admin-api";
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

describe("isBehind", () => {
  it("is false before the first read, and on the same Stockholm day", () => {
    expect(isBehind(null, new Date("2026-08-26T06:00:00Z"))).toBe(false);
    // 23:59 and 00:00 Stockholm (CEST) on 08-26.
    expect(isBehind({ day: "2026-08-26" }, new Date("2026-08-26T21:59:00Z"))).toBe(false);
    expect(isBehind({ day: "2026-08-26" }, new Date("2026-08-25T22:00:00Z"))).toBe(false);
  });

  it("is true once the screen's Stockholm day has turned past the read's", () => {
    // 00:00 Stockholm on 08-27.
    expect(isBehind({ day: "2026-08-26" }, new Date("2026-08-26T22:00:00Z"))).toBe(true);
    // 00:00 CET on 2026-10-26, after the 25-hour day.
    expect(isBehind({ day: "2026-10-25" }, new Date("2026-10-25T23:00:00Z"))).toBe(true);
    expect(isBehind({ day: "2026-10-25" }, new Date("2026-10-25T22:59:00Z"))).toBe(false);
  });

  it("is false for a read whose day is ahead of the screen's", () => {
    expect(isBehind({ day: "2026-08-27" }, new Date("2026-08-26T21:59:00Z"))).toBe(false);
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

describe("listMayHaveChanged", () => {
  it("is true after a success, a 409, a lost answer and a 5xx", () => {
    expect(listMayHaveChanged({ ok: true })).toBe(true);
    expect(listMayHaveChanged({ ok: false, status: 409 })).toBe(true);
    expect(listMayHaveChanged({ ok: false })).toBe(true);
    expect(listMayHaveChanged({ ok: false, status: 500 })).toBe(true);
    expect(listMayHaveChanged({ ok: false, status: 503 })).toBe(true);
  });

  it("is false after any other 4xx", () => {
    for (const status of [400, 401, 403, 404, 408, 499]) {
      expect(listMayHaveChanged({ ok: false, status })).toBe(false);
    }
  });
});

describe("checklistRefusal", () => {
  // Built from the texts the service sends (`OVERLAP_ADVICE`), so a rewording of them that
  // stops ending in `CHANGE_THIS_ENTRY` fails here; the ended case also pins the swapped text
  // as a literal (the owner's wording, IS #274).
  const ended = `Överlappar med 2026-11-11 08:00–10:00${OVERLAP_ADVICE.ended}`;
  const running = `Överlappar med 2026-11-11 11:30–13:00${OVERLAP_ADVICE.running}`;

  it("swaps a 409's advice to change this entry's time for the form's, ended or running", () => {
    expect(checklistRefusal(ended, 409)).toBe(
      "Överlappar med 2026-11-11 08:00–10:00, som redan har slutat. Lägg in en annan tid med formuläret.",
    );
    expect(checklistRefusal(running, 409)).toBe(
      `Överlappar med 2026-11-11 11:30–13:00, som pågår nu.${USE_THE_FORM}`,
    );
  });

  it("leaves any other error, and that text under any other status, as it came", () => {
    for (const error of [
      `Överlappar med 2026-11-11 18:30–19:30${OVERLAP_ADVICE.edit}`,
      "Överlappar med en annan post för samma foodtruck",
      "Tiden har redan passerat",
      API_ERRORS.network,
    ]) {
      expect(checklistRefusal(error, 409)).toBe(error);
    }
    expect(checklistRefusal(running, 400)).toBe(running);
    expect(checklistRefusal(running, undefined)).toBe(running);
  });
});
