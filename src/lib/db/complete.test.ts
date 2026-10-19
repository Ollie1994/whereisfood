import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_ROWS, assertAllRows } from "./complete";

describe("MAX_ROWS", () => {
  it("equals max_rows in supabase/config.toml", () => {
    const config = readFileSync(new URL("../../../supabase/config.toml", import.meta.url), "utf8");
    const match = /^max_rows\s*=\s*(\d+)\s*$/m.exec(config);

    expect(match).not.toBeNull();
    expect(Number(match![1])).toBe(MAX_ROWS);
  });
});

describe("assertAllRows", () => {
  it("passes when every counted row arrived, an empty result included", () => {
    expect(() => assertAllRows("f", [1, 2], 2)).not.toThrow();
    expect(() => assertAllRows("f", [], 0)).not.toThrow();
  });

  it("throws when fewer rows arrived than were counted", () => {
    expect(() => assertAllRows("f", [1], 2)).toThrow(/f: 1 of 2 rows returned/);
  });

  it("names a missing count instead of blaming max_rows", () => {
    expect(() => assertAllRows("f", [], null)).toThrow(/no row count came back/);
  });
});
