import { describe, expect, it } from "vitest";
import { listBehind } from "@/lib/admin-list";
import { stockholmDay } from "@/lib/stockholm";

describe("listBehind", () => {
  // 2026-11-11 23:59:59 and 2026-11-12 00:00:00 in Stockholm (CET, UTC+1).
  const lastSecond = new Date("2026-11-11T22:59:59Z");
  const midnight = new Date("2026-11-11T23:00:00Z");
  const listed = stockholmDay(lastSecond);

  it("is false before any read has come back", () => {
    expect(listBehind(null, midnight)).toBe(false);
  });

  it("is false on the day the list was read for, to its last second", () => {
    expect(listBehind(listed, lastSecond)).toBe(false);
  });

  it("is true from the next Stockholm midnight, and on any later day", () => {
    expect(listBehind(listed, midnight)).toBe(true);
    expect(listBehind(listed, new Date("2026-11-20T12:00:00Z"))).toBe(true);
  });

  it("is false for a list read on a later day than the clock's", () => {
    expect(listBehind(listed + 1, lastSecond)).toBe(false);
  });
});
