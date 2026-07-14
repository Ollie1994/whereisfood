import { getActiveTruckById } from "@/lib/db/trucks";
import { insertPost } from "@/lib/db/posts";
import { validateIngestPayload } from "@/lib/validators/ingest";
import {
  extractTruckIdFromRecipient,
  validateEmailPayload,
  verifyMailgunSignature,
} from "@/lib/validators/email";
import type { IngestResult, NewPost } from "@/lib/types";

// Business logic for the two ingestion lanes. No HTTP knowledge (no NextRequest,
// no after()) — the routes own that. Each `prepare*` runs synchronously before
// the route's 200 so a bad secret/payload/truck can still fail fast; the raw
// insert is deferred to `persistPost`, run by the route inside after().
//
// Parser, geocoding, locations writes, override logic, and caption+60s dedup are
// all Phase 3 — this phase only stores the raw post.

// ---------------------------------------------------------------------------
// Webhook lane (Make.com → POST /api/ingest)
// ---------------------------------------------------------------------------

// Validate the payload, confirm the truck is active, and build the posts row.
// Returns { ok: false, status: 400 } for a bad payload or unknown/inactive truck;
// the X-Make-Secret (401) check lives in the route, not here.
export async function prepareWebhookIngest(body: unknown): Promise<IngestResult> {
  const payload = validateIngestPayload(body);
  if (!payload) {
    return { ok: false, status: 400, error: "Invalid webhook payload" };
  }

  const truck = await getActiveTruckById(payload.truck_id);
  if (!truck) {
    return { ok: false, status: 400, error: "Unknown or inactive truck" };
  }

  const post: NewPost = {
    truck_id: payload.truck_id,
    instagram_post_id: payload.instagram_post_id ?? null,
    caption: payload.caption,
    // Store the specific platform (not the generic "webhook"): posts is the ML
    // corpus, so fine-grained provenance is kept here. The lane ("webhook") is
    // recorded on the location row in Phase 3, where source_confidence applies.
    source: payload.source_platform,
    // Webhook payloads carry no timestamp → posted_at is ingest time. new Date()
    // is fine in the service layer (the purity rule is parser-only).
    posted_at: new Date().toISOString(),
    // Persist the entire incoming body — never lose raw data. Validation already
    // proved body is an object, so this cast is safe.
    raw_json: body as Record<string, unknown>,
    parsing_status: "pending",
  };

  return { ok: true, post };
}

// ---------------------------------------------------------------------------
// Email lane (Mailgun inbound → POST /api/email)
// ---------------------------------------------------------------------------

// Validate the payload, verify the HMAC signature, extract the truck_id from the
// recipient, and confirm the truck is active — then build the posts row. Every
// failure maps to 400 (invalid payload, bad signature, bad recipient, unknown
// truck). Signature is checked before any DB lookup.
export async function prepareEmailIngest(
  obj: Record<string, string>,
  signingKey: string,
): Promise<IngestResult> {
  const payload = validateEmailPayload(obj);
  if (!payload) {
    return { ok: false, status: 400, error: "Invalid email payload" };
  }

  if (!verifyMailgunSignature(payload, signingKey)) {
    return { ok: false, status: 400, error: "Invalid signature" };
  }

  const truckId = extractTruckIdFromRecipient(payload.recipient);
  if (!truckId) {
    return { ok: false, status: 400, error: "Invalid recipient" };
  }

  const truck = await getActiveTruckById(truckId);
  if (!truck) {
    return { ok: false, status: 400, error: "Unknown or inactive truck" };
  }

  const post: NewPost = {
    truck_id: truckId,
    instagram_post_id: null,
    caption: payload["body-plain"],
    source: "email",
    // Email posted_at ≈ when Mailgun relayed the message (the signed Unix
    // timestamp already verified above). Fall back to ingest time if it is not a
    // finite number.
    posted_at: unixToIso(payload.timestamp),
    raw_json: obj,
    parsing_status: "pending",
  };

  return { ok: true, post };
}

// ---------------------------------------------------------------------------
// Deferred raw insert — run by the route inside after(), the first op after 200.
// ---------------------------------------------------------------------------

// Persist the raw post. Swallows a duplicate instagram_post_id (Postgres 23505,
// enforced by the posts_instagram_post_id_unique index) as a benign discard —
// consistent with returning 200 immediately. Any other error propagates.
export async function persistPost(post: NewPost): Promise<void> {
  try {
    await insertPost(post);
  } catch (err) {
    if (isUniqueViolation(err)) return;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function unixToIso(timestamp: string): string {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds)) return new Date().toISOString();
  return new Date(seconds * 1000).toISOString();
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "23505"
  );
}
