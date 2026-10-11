import { describe, expect, it } from "vitest";
import { isUuid } from "@/lib/validators/uuid";

describe("isUuid", () => {
  it.each([
    ["a v4 UUID", "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b"],
    ["the seed trucks' all-'1' UUID (version nibble 1)", "11111111-1111-1111-1111-111111111111"],
    ["upper-case hex", "3F2B8C1E-9A4D-4E6F-8B2A-1C3D5E7F9A0B"],
  ])("accepts %s", (_label, value) => {
    expect(isUuid(value)).toBe(true);
  });

  it.each([
    ["an empty string", ""],
    ["a non-UUID string", "not-a-uuid"],
    ["no hyphens", "3f2b8c1e9a4d4e6f8b2a1c3d5e7f9a0b"],
    ["a non-hex character", "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0g"],
    ["a group one character short", "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0"],
    ["surrounding whitespace", " 3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b"],
    ["a trailing newline", "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b\n"],
  ])("rejects %s", (_label, value) => {
    expect(isUuid(value)).toBe(false);
  });
});
