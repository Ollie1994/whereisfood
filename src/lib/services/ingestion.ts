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
// recipient, confirm the truck is active — then build the posts row. Rejections
// (all 400) are: invalid payload, bad signature, bad recipient, unknown truck.
// The signature is checked before any DB lookup.
//
// A STALE timestamp is deliberately NOT a rejection (issue #53). Signature
// verification and freshness answer different questions: an invalid signature
// means "we don't know who sent this" (reject), whereas a valid signature with an
// old timestamp means "we know Mailgun sent this, it is just old" — a genuine
// truck email that belongs in the permanent corpus. Freshness therefore governs
// whether we ACT on a post, not whether we KEEP it, and a stale payload is stored
// with parsing_status 'skipped' instead of being thrown away.
//
// `now` is injected (defaulting to wall clock) so the freshness rule stays
// unit-testable without faking timers — the purity rule is parser-only, but a
// clock parameter is cheap here.
export async function prepareEmailIngest(
  obj: Record<string, string>,
  signingKey: string,
  now: number = Date.now(),
): Promise<IngestResult> {
  const payload = validateEmailPayload(obj);
  if (!payload) {
    return { ok: false, status: 400, error: "Invalid email payload" };
  }

  if (!verifyMailgunSignature(payload, signingKey)) {
    return { ok: false, status: 400, error: "Invalid signature" };
  }

  // Replay guard. A valid signature proves the payload was signed with our key,
  // but a captured (timestamp, token, signature) tuple stays valid forever, so
  // anything outside the ±15 min window (REPLAY_WINDOW_SECONDS — see there for why
  // 15 and why it must not go below 10) is treated as untrustworthy TO ACT ON.
  // Evaluated AFTER the signature so the rule only ever applies to genuinely
  // Mailgun-signed payloads.
  //
  // Note this is also true for a non-numeric timestamp: isFreshTimestamp fails
  // closed on those, so they land here as stale rather than being rejected. That
  // is intended — a garbage timestamp that still carries a valid signature is
  // exactly the kind of anomaly the corpus should retain for inspection.
  //
  // Rejecting already-seen tokens (a token cache) is the stronger control and is
  // deferred to Phase 7, where Upstash Redis is already being introduced.
  const isStale = !isFreshTimestamp(payload.timestamp, now);

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
    posted_at: unixToIso(payload.timestamp, now),
    raw_json: obj,
    // 'skipped' means "deliberately not parsed", which is exactly the state a
    // stale-but-authentic email is in: kept in the corpus forever, but never
    // allowed to create or override a live location. The Phase 3 parser MUST
    // filter these out when writing `locations`, or this whole guard is moot.
    parsing_status: isStale ? "skipped" : "pending",
  };

  return { ok: true, post };
}

// ---------------------------------------------------------------------------
// Deferred raw insert — run by the route inside after(), the first op after 200.
// ---------------------------------------------------------------------------

// Persist the raw post. Swallows a duplicate instagram_post_id (Postgres 23505,
// enforced by the posts_instagram_post_id_unique index) as a benign discard.
// Any other error propagates.
//
// ERROR-CONTRACT NOTE (issue #51): the documented API Error Format lists 409 for
// "discarded duplicate", but that status is UNREACHABLE for this lane and always
// will be. The route sends its 200 before after() runs, so by the time the unique
// violation surfaces here the response has already been committed — a duplicate
// therefore resolves as **200 + silent discard**, never 409. This is deliberate
// (webhook endpoints must ack immediately), not an oversight. 409 stays reserved
// for a future synchronous caller that can still influence its own response.
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

// Mailgun signs a Unix-seconds timestamp. Accept a ±15 min window around the
// current clock, tolerating skew in both directions (a future-dated timestamp is
// as suspect as an old one). A non-numeric timestamp is not fresh.
//
// 15 min is Mailgun's OWN documented tolerance, and they explicitly warn against
// being more aggressive because delivery delays outside their control are normal.
// It also matters operationally: Mailgun retries a failed POST at 10, 20, 35, 65,
// 125, 245 and 485 min (cumulative). This route returns 200 before the DB write,
// so the only 5xx paths are a missing signing key or Supabase being unreachable
// during the truck lookup — and on those, a window under 10 min would mark even
// the very first retry unparseable. 15 min keeps that one actionable.
//
// Crucially, exceeding the window is NOT data loss (issue #53): a stale payload is
// still stored, just with parsing_status 'skipped'. So an outage outliving the
// window costs us the LOCATION, never the post. That is why the exact value is no
// longer load-bearing — it decides parsed-vs-skipped, not kept-vs-lost.
//
// Note this window is deliberately NOT the primary replay defence — Mailgun's
// recommended control is caching the single-use `token` and rejecting repeats,
// which lands in Phase 7 alongside Upstash Redis. Issue #46 originally specified
// ~5 min; that was tightened past the vendor guidance and widened here on review.
const REPLAY_WINDOW_SECONDS = 15 * 60;

// Strict numeric parse. Number("") and Number("   ") are BOTH 0 — and 0 is finite —
// so a bare Number.isFinite check silently accepts a blank timestamp as the Unix
// epoch. Reject blanks explicitly and return null for anything non-numeric, so
// both callers below fail closed instead of quietly landing on 1970-01-01.
// Accepted Unix-seconds range: the epoch through year 9999.
//
// Bounding to the JS Date range (±8.64e12 s) is NOT enough. That keeps
// .toISOString() from throwing, but the JS floor (year -271821) sits before what
// Postgres `timestamptz` can store (4713 BC), so a value in that gap produces a
// perfectly valid ISO string that the INSERT then rejects. Because the raw insert
// runs inside after(), that error surfaces only after the 200 has shipped — it is
// swallowed and logged, Mailgun never retries, and the mail is silently lost:
// exactly the failure mode this issue exists to remove.
//
// So bound to what is both storable AND plausible. An email cannot predate the
// Unix epoch, and year 9999 is comfortably inside timestamptz.
const MIN_ACCEPTED_SECONDS = 0; // 1970-01-01T00:00:00Z
const MAX_ACCEPTED_SECONDS = 253_402_300_799; // 9999-12-31T23:59:59Z

function toFiniteSeconds(timestamp: string): number | null {
  if (typeof timestamp !== "string" || timestamp.trim() === "") return null;
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds)) return null;
  // Finite is not sufficient: "1e30" and "-8640000000000" are both finite but
  // unusable — the first overflows Date, the second underflows timestamptz.
  // Same class of trap as Number("") being a finite 0.
  if (seconds < MIN_ACCEPTED_SECONDS || seconds > MAX_ACCEPTED_SECONDS) return null;
  return seconds;
}

export function isFreshTimestamp(timestamp: string, now: number): boolean {
  const seconds = toFiniteSeconds(timestamp);
  if (seconds === null) return false;
  return Math.abs(now / 1000 - seconds) <= REPLAY_WINDOW_SECONDS;
}

// Converts Mailgun's signed Unix-seconds timestamp to ISO, falling back to ingest
// time when the value is unusable (blank, non-numeric, or out of the storable
// range above).
//
// The fallback IS reachable from prepareEmailIngest as of #53. It previously was
// not — an unparseable timestamp used to 400 at the freshness check — but stale
// and unparseable now both flow through to a stored 'skipped' post, so a garbage
// timestamp reaches this. `now` is therefore threaded in rather than read from the
// wall clock, so posted_at stays deterministic under an injected test clock.
export function unixToIso(timestamp: string, now: number = Date.now()): string {
  const seconds = toFiniteSeconds(timestamp);
  if (seconds === null) return new Date(now).toISOString();
  return new Date(seconds * 1000).toISOString();
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "23505"
  );
}
