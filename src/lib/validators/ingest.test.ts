import { describe, expect, it } from "vitest";
import { validateIngestPayload } from "@/lib/validators/ingest";

const TRUCK_ID = "11111111-1111-1111-1111-111111111111";

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    truck_id: TRUCK_ID,
    caption: "Vi står vid Järntorget idag 11-14",
    source_platform: "instagram",
    ...overrides,
  };
}

describe("validateIngestPayload", () => {
  it("returns a typed payload for a valid full body", () => {
    const result = validateIngestPayload(validBody({ instagram_post_id: "abc123" }));
    expect(result).toEqual({
      truck_id: TRUCK_ID,
      caption: "Vi står vid Järntorget idag 11-14",
      source_platform: "instagram",
      instagram_post_id: "abc123",
    });
  });

  it("omits instagram_post_id when it is absent", () => {
    const result = validateIngestPayload(validBody());
    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty("instagram_post_id");
  });

  it("treats null / empty-string instagram_post_id as absent (accepted, omitted)", () => {
    for (const value of [null, ""]) {
      const result = validateIngestPayload(validBody({ instagram_post_id: value }));
      expect(result).not.toBeNull();
      expect(result).not.toHaveProperty("instagram_post_id");
    }
  });

  it("returns null when a present instagram_post_id is the wrong type", () => {
    expect(validateIngestPayload(validBody({ instagram_post_id: 123 }))).toBeNull();
  });

  // truck_id ---------------------------------------------------------------
  it("returns null for a non-UUID truck_id", () => {
    expect(validateIngestPayload(validBody({ truck_id: "not-a-uuid" }))).toBeNull();
  });

  it("returns null when truck_id is missing", () => {
    const { truck_id, ...withoutTruckId } = validBody();
    void truck_id;
    expect(validateIngestPayload(withoutTruckId)).toBeNull();
  });

  it("accepts any UUID version (seed trucks use all-'1' UUIDs)", () => {
    expect(validateIngestPayload(validBody())).not.toBeNull();
  });

  // caption ----------------------------------------------------------------
  it("accepts an empty caption (image-only post still enters the corpus)", () => {
    const result = validateIngestPayload(validBody({ caption: "" }));
    expect(result?.caption).toBe("");
  });

  it("accepts a whitespace-only caption and keeps it raw", () => {
    const result = validateIngestPayload(validBody({ caption: "   " }));
    expect(result?.caption).toBe("   ");
  });

  it("returns null when caption is missing", () => {
    const { caption, ...withoutCaption } = validBody();
    void caption;
    expect(validateIngestPayload(withoutCaption)).toBeNull();
  });

  it("returns null when caption is not a string", () => {
    expect(validateIngestPayload(validBody({ caption: 5 }))).toBeNull();
  });

  // source_platform --------------------------------------------------------
  it.each(["instagram", "facebook", "tiktok"])(
    "accepts source_platform '%s'",
    (platform) => {
      expect(validateIngestPayload(validBody({ source_platform: platform }))).not.toBeNull();
    },
  );

  it("returns null for an unknown source_platform", () => {
    expect(validateIngestPayload(validBody({ source_platform: "twitter" }))).toBeNull();
  });

  it("returns null when source_platform is missing", () => {
    const { source_platform, ...withoutPlatform } = validBody();
    void source_platform;
    expect(validateIngestPayload(withoutPlatform)).toBeNull();
  });

  // shape ------------------------------------------------------------------
  it.each([null, undefined, "string", 42, true])(
    "returns null for a non-object body (%s)",
    (body) => {
      expect(validateIngestPayload(body)).toBeNull();
    },
  );

  it("returns null for an array body", () => {
    expect(validateIngestPayload([TRUCK_ID, "caption"])).toBeNull();
  });

  it("ignores unknown extra keys", () => {
    const result = validateIngestPayload(validBody({ unexpected: "ignored" }));
    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty("unexpected");
  });
});
