import type { IngestPayload } from "@/lib/types";
import { isUuid } from "@/lib/validators/uuid";

const SOURCE_PLATFORMS = ["instagram", "facebook", "tiktok"] as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

// Pure shape validation for the webhook (Make.com) payload. Returns a typed
// IngestPayload for well-formed input, or null for any missing/invalid field.
// No DB, no HTTP, no env — the route/service decide what null means (→ 400).
export function validateIngestPayload(body: unknown): IngestPayload | null {
  if (!isRecord(body)) return null;

  const { truck_id, caption, source_platform } = body;

  // truck_id must be a well-formed UUID (stops a malformed id reaching the DB
  // layer as a Postgres 22P02 invalid-uuid error — see PR #38 review).
  if (typeof truck_id !== "string" || !isUuid(truck_id)) return null;
  // caption must be present but may be empty: an image-only post (no caption)
  // is still valid input and must enter the posts corpus — the parser scores an
  // empty caption 0, it is not rejected here ("never lose incoming data").
  if (typeof caption !== "string") return null;
  if (
    typeof source_platform !== "string" ||
    !(SOURCE_PLATFORMS as readonly string[]).includes(source_platform)
  ) {
    return null;
  }

  // Optional field: absent (undefined/null/empty string) is fine and omitted;
  // a present value of the wrong type is invalid.
  const rawId = body.instagram_post_id;
  let instagram_post_id: string | undefined;
  if (rawId !== undefined && rawId !== null) {
    if (typeof rawId !== "string") return null;
    if (rawId.length > 0) instagram_post_id = rawId;
  }

  const payload: IngestPayload = {
    truck_id,
    caption,
    source_platform: source_platform as IngestPayload["source_platform"],
  };
  if (instagram_post_id !== undefined) payload.instagram_post_id = instagram_post_id;
  return payload;
}
