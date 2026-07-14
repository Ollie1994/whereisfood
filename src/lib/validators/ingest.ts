import type { IngestPayload } from "@/lib/types";

// 8-4-4-4-12 hex — accepts any UUID version. NOT a strict v4 regex: the seed
// trucks use all-'1' UUIDs (version nibble 1), which a v4-only pattern would
// reject. Validating truck_id shape here stops a malformed id from reaching the
// DB layer as a Postgres 22P02 invalid-uuid error (see PR #38 review).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  if (typeof truck_id !== "string" || !UUID_RE.test(truck_id)) return null;
  // Non-empty after trim: a webhook post with no caption text has nothing to
  // ingest. The original (untrimmed) caption is kept — the posts corpus stores raw.
  if (typeof caption !== "string" || caption.trim().length === 0) return null;
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
