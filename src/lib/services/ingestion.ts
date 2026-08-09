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
  // Only genuinely OLD payloads reach this branch. A malformed timestamp is
  // rejected earlier by validateEmailPayload, which pins it to exactly 10 digits —
  // that width is what makes the signed `timestamp + token` split unambiguous and
  // is a security control, not cosmetics. See UNIX_SECONDS_10_DIGITS.
  //
  // Rejecting already-seen tokens is the stronger control, and it ships here as
  // posts_email_token_unique (migration 0004) rather than waiting for Phase 7 —
  // accepting stale payloads is precisely what made it necessary. Phase 7's Redis
  // token cache complements that index; it does not replace it (a cache TTL is a
  // finite protection window, the index never expires).
  //
  // ⚠ Note the index protects the CORPUS, not the database. A replayed tuple no
  // longer stores a row, but it still costs a trucks lookup plus a failed insert,
  // and /api/email has no rate limit until Phase 7. Short-circuiting replays
  // before the DB round trip needs a cache in front — that is the Phase 7 job.
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
    // Everything Mailgun sent EXCEPT the signature — see redactSignature.
    raw_json: redactSignature(obj),
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

// Persist the raw post. Swallows a Postgres 23505 unique violation as a benign
// discard. TWO indexes can raise it, and both mean "we already have this":
//   * posts_instagram_post_id_unique — the same Instagram post seen twice
//   * posts_email_token_unique       — a replayed Mailgun token (migration 0004)
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
    if (isUniqueViolation(err)) {
      // Log rather than return silently. A discard here is invisible by
      // construction — the 200 has already shipped, so nothing surfaces to the
      // caller and Mailgun will not retry. The email lane's guard also rests on
      // Mailgun's token being single-use per delivery, which could not be
      // confirmed from their docs; if that ever proves wrong, a GENUINE second
      // email would be dropped here with no trace at all. The constraint name
      // makes the two cases distinguishable in logs.
      console.warn(
        `[ingestion] discarded duplicate post (truck ${post.truck_id}, source ${post.source}):`,
        constraintName(err) ?? "unknown constraint",
      );
      return;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Drop `signature` before the payload is persisted.
//
// WHY (issue #53 review): `posts` is permanent and never purged, so anything
// stored here is stored forever. Retaining the full (timestamp, token, signature)
// tuple turned every row into a ready-to-replay request — a replay armory sitting
// in our own database, reachable via a leaked service-role key, a DB backup, or
// the eventual ML training export. HTTPS does nothing about any of those; it only
// protects the wire.
//
// Removing the SIGNATURE alone is sufficient and is why `token` stays. Replaying
// requires all three fields, and the signature is HMAC-SHA256(timestamp + token)
// under the signing key. An attacker holding timestamp and token but not the
// signature cannot compute it without the key, so the tuple is inert.
//
// Keeping `token` is deliberate and load-bearing: posts_email_token_unique
// (migration 0004) indexes it to make replays collide on insert. Strip the token
// too and that dedup silently stops working. Keeping it costs nothing — a token
// without its signature has no replay value.
//
// `timestamp` also stays: it is posted_at provenance and is likewise inert alone.
// Nothing else in the codebase reads raw_json.signature after verification, which
// has already happened by the time this runs.
function redactSignature(obj: Record<string, string>): Record<string, string> {
  // Copy rather than delete in place — obj is the caller's object, and mutating a
  // parameter would surprise anyone reusing it (the route logs it on failure).
  const copy = { ...obj };
  delete copy.signature;
  return copy;
}

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
// The fallback is NOT reachable from prepareEmailIngest: validateEmailPayload
// pins the timestamp to 10 digits, which is always finite and inside the range
// above. It is kept as defence in depth for any future caller and is tested
// directly. `now` is threaded in rather than read from the wall clock so that, if
// the fallback ever does fire, posted_at stays deterministic and consistent with
// the rest of the request instead of drifting to a second clock reading.
export function unixToIso(timestamp: string, now: number = Date.now()): string {
  const seconds = toFiniteSeconds(timestamp);
  if (seconds === null) return new Date(now).toISOString();
  return new Date(seconds * 1000).toISOString();
}

// Which constraint a 23505 came from. PostgREST surfaces it in `details`/`message`
// rather than as a dedicated field, so match the known index names instead of
// parsing. Returns null when it cannot be identified — the caller logs that too.
function constraintName(err: unknown): string | null {
  if (typeof err !== "object" || err === null) return null;
  const { details, message } = err as { details?: string; message?: string };
  const haystack = `${details ?? ""} ${message ?? ""}`;
  for (const name of [
    "posts_email_token_unique",
    "posts_instagram_post_id_unique",
  ]) {
    if (haystack.includes(name)) return name;
  }
  return null;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "23505"
  );
}
