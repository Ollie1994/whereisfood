import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The db layer is mocked, so @/lib/supabase is never imported and its top-level
// env guards never run — these stay true unit tests with no local stack required.
vi.mock("@/lib/db/trucks", () => ({ getActiveTruckById: vi.fn() }));
vi.mock("@/lib/db/posts", () => ({ insertPost: vi.fn() }));

import { getActiveTruckById } from "@/lib/db/trucks";
import { insertPost } from "@/lib/db/posts";
import {
  isFreshTimestamp,
  persistPost,
  prepareEmailIngest,
  prepareWebhookIngest,
  unixToIso,
} from "@/lib/services/ingestion";
import type { NewPost, Truck } from "@/lib/types";

const getActiveTruckByIdMock = vi.mocked(getActiveTruckById);
const insertPostMock = vi.mocked(insertPost);

const TRUCK_ID = "11111111-1111-1111-1111-111111111111";
const SIGNING_KEY = "dev-mailgun-signing-key-local";
const NOW_MS = 1_760_000_000_000; // fixed clock; NOW_MS / 1000 = 1_760_000_000

const ACTIVE_TRUCK: Truck = {
  id: TRUCK_ID,
  name: "Burgarbilen",
  instagram_handle: "burgarbilen_gbg",
  cuisine_type: "Burgare",
  description: null,
  is_active: true,
  last_known_latitude: 57.6997,
  last_known_longitude: 11.954,
  created_at: "2026-01-01T00:00:00.000Z",
};

// Build a Mailgun form object with a genuinely valid HMAC, mirroring
// scripts/sign-mailgun.mjs — a hand-written signature could never pass.
function signedEmail(
  overrides: Partial<Record<string, string>> = {},
  key = SIGNING_KEY,
): Record<string, string> {
  const timestamp = overrides.timestamp ?? String(NOW_MS / 1000);
  const token = overrides.token ?? "abc123token";
  const signature = createHmac("sha256", key)
    .update(timestamp + token)
    .digest("hex");

  return {
    recipient: `${TRUCK_ID}@in.yourapp.se`,
    "body-plain": "Vi står vid Järntorget 11-14",
    ...overrides,
    timestamp,
    token,
    signature: overrides.signature ?? signature,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getActiveTruckByIdMock.mockResolvedValue(ACTIVE_TRUCK);
});

// ---------------------------------------------------------------------------
// isFreshTimestamp — the replay guard (#46)
// ---------------------------------------------------------------------------

describe("isFreshTimestamp", () => {
  const nowSeconds = NOW_MS / 1000;

  it("accepts a timestamp at the current clock", () => {
    expect(isFreshTimestamp(String(nowSeconds), NOW_MS)).toBe(true);
  });

  it("accepts a timestamp inside the ±15 min window in both directions", () => {
    expect(isFreshTimestamp(String(nowSeconds - 899), NOW_MS)).toBe(true);
    expect(isFreshTimestamp(String(nowSeconds + 899), NOW_MS)).toBe(true);
  });

  it("accepts the window boundary exactly", () => {
    expect(isFreshTimestamp(String(nowSeconds - 900), NOW_MS)).toBe(true);
    expect(isFreshTimestamp(String(nowSeconds + 900), NOW_MS)).toBe(true);
  });

  it("accepts Mailgun's first retry at 10 min", () => {
    // Mailgun retries at 10/20/35/65/125/245/485 min cumulative. A window under
    // 10 min would reject the FIRST retry after a transient 5xx and permanently
    // drop the message — this pins the "never lose incoming data" guarantee.
    expect(isFreshTimestamp(String(nowSeconds - 600), NOW_MS)).toBe(true);
  });

  it("rejects a stale timestamp past the window", () => {
    expect(isFreshTimestamp(String(nowSeconds - 901), NOW_MS)).toBe(false);
    expect(isFreshTimestamp(String(nowSeconds - 86400), NOW_MS)).toBe(false);
  });

  it("rejects a future-dated timestamp past the window", () => {
    // Clock skew is tolerated symmetrically; a far-future stamp is as suspect.
    expect(isFreshTimestamp(String(nowSeconds + 901), NOW_MS)).toBe(false);
  });

  it("rejects a non-numeric timestamp", () => {
    expect(isFreshTimestamp("not-a-number", NOW_MS)).toBe(false);
    expect(isFreshTimestamp("NaN", NOW_MS)).toBe(false);
    expect(isFreshTimestamp("Infinity", NOW_MS)).toBe(false);
  });

  it("rejects a finite but unrepresentable timestamp without throwing", () => {
    expect(() => isFreshTimestamp("1e30", NOW_MS)).not.toThrow();
    expect(isFreshTimestamp("1e30", NOW_MS)).toBe(false);
    expect(isFreshTimestamp("99999999999999", NOW_MS)).toBe(false);
  });

  it("rejects a blank timestamp (Number(\"\") is a finite 0)", () => {
    // Without the explicit blank check these parse as the epoch, which is far
    // outside the window — correct outcome, but only by accident. Pinned so a
    // future change to the window can't turn the accident into an acceptance.
    expect(isFreshTimestamp("", NOW_MS)).toBe(false);
    expect(isFreshTimestamp("   ", NOW_MS)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// unixToIso — Mailgun's signed Unix seconds → ISO
//
// Tested directly rather than through prepareEmailIngest: isFreshTimestamp now
// rejects every non-numeric timestamp first, so no lane can reach the fallback.
// ---------------------------------------------------------------------------

describe("unixToIso", () => {
  it("converts Unix seconds to an ISO string", () => {
    expect(unixToIso("1760000000")).toBe("2025-10-09T08:53:20.000Z");
  });

  it("handles a fractional-second timestamp", () => {
    expect(unixToIso("1760000000.5")).toBe("2025-10-09T08:53:20.500Z");
  });

  it("falls back to ingest time for a non-finite timestamp", () => {
    const before = Date.now();
    const iso = unixToIso("not-a-number");
    const after = Date.now();

    const parsed = Date.parse(iso);
    expect(Number.isNaN(parsed)).toBe(false);
    expect(parsed).toBeGreaterThanOrEqual(before);
    expect(parsed).toBeLessThanOrEqual(after);
  });

  it("falls back for an out-of-range timestamp instead of throwing", () => {
    // Two distinct failure modes: overflowing the JS Date range (RangeError on
    // toISOString) and underflowing Postgres timestamptz (valid ISO, rejected
    // INSERT). Both must fall back, not propagate.
    for (const bad of ["99999999999999", "1e30", "-1e30", "-8640000000000", "-1"]) {
      expect(() => unixToIso(bad, NOW_MS)).not.toThrow();
      expect(unixToIso(bad, NOW_MS)).toBe(new Date(NOW_MS).toISOString());
    }
  });

  it("uses the injected clock for the fallback, not the wall clock", () => {
    const injected = 1_600_000_000_000;
    expect(unixToIso("garbage", injected)).toBe(new Date(injected).toISOString());
  });

  it("still accepts a representable far-future timestamp", () => {
    // Guards the range check against being too aggressive.
    expect(unixToIso("8640000000")).toBe("2243-10-17T00:00:00.000Z");
  });

  it("accepts the exact range boundaries", () => {
    expect(unixToIso("0")).toBe("1970-01-01T00:00:00.000Z");
    expect(unixToIso("253402300799")).toBe("9999-12-31T23:59:59.000Z");
  });

  it("falls back for a blank timestamp rather than yielding the epoch", () => {
    // Number("") and Number("  ") are both 0, which IS finite — without an
    // explicit blank check these silently become 1970-01-01 instead of falling
    // back to ingest time. Regression guard for that exact trap.
    for (const blank of ["", "   ", "\t"]) {
      const parsed = Date.parse(unixToIso(blank));
      expect(parsed).toBeGreaterThan(Date.parse("2020-01-01T00:00:00.000Z"));
    }
  });
});

// ---------------------------------------------------------------------------
// prepareWebhookIngest
// ---------------------------------------------------------------------------

describe("prepareWebhookIngest", () => {
  const validBody = {
    truck_id: TRUCK_ID,
    caption: "Idag står vi vid Järntorget 11-14",
    source_platform: "instagram",
  };

  it("rejects an invalid payload with 400 and never touches the DB", async () => {
    const result = await prepareWebhookIngest({ truck_id: "not-a-uuid" });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "Invalid webhook payload",
    });
    expect(getActiveTruckByIdMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown or inactive truck with 400", async () => {
    getActiveTruckByIdMock.mockResolvedValue(null);

    const result = await prepareWebhookIngest(validBody);

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "Unknown or inactive truck",
    });
  });

  it("builds the posts row for a valid payload", async () => {
    const result = await prepareWebhookIngest(validBody);

    expect(result.ok).toBe(true);
    if (!result.ok) return; // narrow for TS

    expect(result.post).toMatchObject({
      truck_id: TRUCK_ID,
      caption: validBody.caption,
      // The specific platform is stored, NOT the generic "webhook" lane —
      // posts is the ML corpus and keeps fine-grained provenance.
      source: "instagram",
      instagram_post_id: null,
      parsing_status: "pending",
    });
    // Persist the entire incoming body verbatim — never lose raw data.
    expect(result.post.raw_json).toEqual(validBody);
    expect(getActiveTruckByIdMock).toHaveBeenCalledWith(TRUCK_ID);
  });

  it("uses ingest time for posted_at (webhook payloads carry no timestamp)", async () => {
    const before = Date.now();
    const result = await prepareWebhookIngest(validBody);
    const after = Date.now();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const postedAt = Date.parse(result.post.posted_at);
    expect(Number.isNaN(postedAt)).toBe(false);
    expect(postedAt).toBeGreaterThanOrEqual(before);
    expect(postedAt).toBeLessThanOrEqual(after);
  });

  it("preserves instagram_post_id when present", async () => {
    const result = await prepareWebhookIngest({
      ...validBody,
      instagram_post_id: "IG_12345",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.post.instagram_post_id).toBe("IG_12345");
  });
});

// ---------------------------------------------------------------------------
// prepareEmailIngest
// ---------------------------------------------------------------------------

describe("prepareEmailIngest", () => {
  it("rejects an invalid payload with 400", async () => {
    const result = await prepareEmailIngest({ recipient: "" }, SIGNING_KEY, NOW_MS);

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "Invalid email payload",
    });
  });

  it("rejects a bad signature before any DB lookup", async () => {
    const obj = signedEmail({ signature: "deadbeef".repeat(8) });

    const result = await prepareEmailIngest(obj, SIGNING_KEY, NOW_MS);

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "Invalid signature",
    });
    expect(getActiveTruckByIdMock).not.toHaveBeenCalled();
  });

  it("rejects a payload signed with the wrong key", async () => {
    const obj = signedEmail({}, "wrong-key");

    const result = await prepareEmailIngest(obj, SIGNING_KEY, NOW_MS);

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "Invalid signature",
    });
  });

  it("ACCEPTS a correctly signed but stale payload, marked 'skipped'", async () => {
    // Issue #53: a stale payload is authentic (the signature verifies), just old.
    // It must be kept in the corpus — never discarded — but must not be parsed.
    const obj = signedEmail({ timestamp: String(NOW_MS / 1000 - 3600) });

    const result = await prepareEmailIngest(obj, SIGNING_KEY, NOW_MS);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.post.parsing_status).toBe("skipped");
    // Still a fully-formed corpus row — nothing about it is degraded beyond the
    // deliberately redacted signature.
    expect(result.post.truck_id).toBe(TRUCK_ID);
    expect(result.post.caption).toBe("Vi står vid Järntorget 11-14");
    const withoutSignature = { ...obj };
    delete withoutSignature.signature;
    expect(result.post.raw_json).toEqual(withoutSignature);
  });

  it("marks a future-dated stale payload 'skipped' too", async () => {
    const obj = signedEmail({ timestamp: String(NOW_MS / 1000 + 3600) });

    const result = await prepareEmailIngest(obj, SIGNING_KEY, NOW_MS);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.post.parsing_status).toBe("skipped");
  });

  it("rejects a malformed timestamp rather than storing it", async () => {
    // Deliberately NOT stored as 'skipped'. A non-10-digit timestamp carrying a
    // valid signature is the re-split vector, not a curiosity worth keeping — so
    // the validator refuses it up front. A genuine Mailgun email always carries
    // 10-digit Unix seconds, and a format change would fail loudly (every mail
    // 400s) rather than silently, which is the failure mode we can actually see.
    for (const bad of ["not-a-number", "-8640000000000", "1e30", "99999999999999"]) {
      const result = await prepareEmailIngest(
        signedEmail({ timestamp: bad }),
        SIGNING_KEY,
        NOW_MS,
      );

      expect(result).toEqual({
        ok: false,
        status: 400,
        error: "Invalid email payload",
      });
    }
    // Nothing reached the DB.
    expect(getActiveTruckByIdMock).not.toHaveBeenCalled();
  });

  it("preserves the signed timestamp as posted_at even when stale", async () => {
    const staleSeconds = NOW_MS / 1000 - 3600;
    const obj = signedEmail({ timestamp: String(staleSeconds) });

    const result = await prepareEmailIngest(obj, SIGNING_KEY, NOW_MS);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The email really was sent an hour ago — posted_at must reflect that, not
    // ingest time, or the corpus loses when the truck actually posted.
    expect(result.post.posted_at).toBe(new Date(staleSeconds * 1000).toISOString());
  });

  it("still validates the truck for a stale payload", async () => {
    // Staleness must not become a bypass around truck validation.
    getActiveTruckByIdMock.mockResolvedValue(null);
    const obj = signedEmail({ timestamp: String(NOW_MS / 1000 - 3600) });

    const result = await prepareEmailIngest(obj, SIGNING_KEY, NOW_MS);

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "Unknown or inactive truck",
    });
  });

  it("rejects a re-split of the signed string (HMAC boundary ambiguity)", async () => {
    // Mailgun signs `timestamp + token` with NO delimiter, so the same signed
    // string can be re-split at any interior index and EVERY split verifies under
    // the SAME signature while producing a different token. Without a fixed-width
    // timestamp, one captured tuple yields dozens of distinct dedup keys and walks
    // straight past the replay guard. Pinning the timestamp to 10 digits makes the
    // split unique, so every shifted variant now fails validation outright.
    const real = signedEmail();
    const joined = real.timestamp + real.token;

    for (const splitAt of [9, 11, 5]) {
      const shifted = {
        ...real,
        timestamp: joined.slice(0, splitAt),
        token: joined.slice(splitAt),
        signature: real.signature, // unchanged — and it still verifies
      };

      const result = await prepareEmailIngest(shifted, SIGNING_KEY, NOW_MS);

      expect(result).toEqual({
        ok: false,
        status: 400,
        error: "Invalid email payload",
      });
    }
  });

  it("rejects a non-10-digit timestamp outright", async () => {
    for (const bad of ["178628700", "17862870099", "1.76e9", "abc", ""]) {
      const result = await prepareEmailIngest(
        { ...signedEmail(), timestamp: bad },
        SIGNING_KEY,
        NOW_MS,
      );
      expect(result.ok).toBe(false);
    }
  });

  it("rejects a stale payload whose signature is invalid", async () => {
    // Order matters: an unsigned payload is rejected regardless of age. Staleness
    // must never soften the authenticity check.
    const obj = signedEmail({
      timestamp: String(NOW_MS / 1000 - 3600),
      signature: "deadbeef".repeat(8),
    });

    const result = await prepareEmailIngest(obj, SIGNING_KEY, NOW_MS);

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "Invalid signature",
    });
    expect(getActiveTruckByIdMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed recipient with 400", async () => {
    const obj = signedEmail({ recipient: "not-a-uuid@in.yourapp.se" });

    const result = await prepareEmailIngest(obj, SIGNING_KEY, NOW_MS);

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "Invalid recipient",
    });
  });

  it("rejects a recipient on the wrong domain with 400", async () => {
    const obj = signedEmail({ recipient: `${TRUCK_ID}@evil.example.com` });

    const result = await prepareEmailIngest(obj, SIGNING_KEY, NOW_MS);

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "Invalid recipient",
    });
  });

  it("rejects an unknown or inactive truck with 400", async () => {
    getActiveTruckByIdMock.mockResolvedValue(null);

    const result = await prepareEmailIngest(signedEmail(), SIGNING_KEY, NOW_MS);

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "Unknown or inactive truck",
    });
  });

  it("builds the posts row for a valid payload", async () => {
    const obj = signedEmail();

    const result = await prepareEmailIngest(obj, SIGNING_KEY, NOW_MS);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.post).toMatchObject({
      truck_id: TRUCK_ID,
      caption: "Vi står vid Järntorget 11-14",
      source: "email",
      instagram_post_id: null,
      parsing_status: "pending",
      // posted_at comes from the SIGNED Mailgun timestamp, not ingest time.
      posted_at: new Date(NOW_MS).toISOString(),
    });
  });

  it("strips the signature from raw_json but keeps token and timestamp", async () => {
    // posts is permanent and never purged, so a stored signature would make every
    // row a ready-to-replay request. Replay needs all three of timestamp/token/
    // signature, and the signature cannot be recomputed without the signing key —
    // so removing it alone renders the stored tuple inert.
    const obj = signedEmail();

    const result = await prepareEmailIngest(obj, SIGNING_KEY, NOW_MS);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.post.raw_json).not.toHaveProperty("signature");
    // token MUST survive — posts_email_token_unique (0004) keys the replay guard
    // on it. Stripping it would silently disable that dedup.
    expect(result.post.raw_json.token).toBe(obj.token);
    expect(result.post.raw_json.timestamp).toBe(obj.timestamp);
  });

  it("does not mutate the caller's payload object when redacting", async () => {
    const obj = signedEmail();
    const originalSignature = obj.signature;

    await prepareEmailIngest(obj, SIGNING_KEY, NOW_MS);

    // The route still holds this object; mutating it in place would be a nasty
    // surprise for any later reader (e.g. failure logging).
    expect(obj.signature).toBe(originalSignature);
  });

  it("strips the signature from a stale payload too", async () => {
    const obj = signedEmail({ timestamp: String(NOW_MS / 1000 - 3600) });

    const result = await prepareEmailIngest(obj, SIGNING_KEY, NOW_MS);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.post.parsing_status).toBe("skipped");
    expect(result.post.raw_json).not.toHaveProperty("signature");
    expect(result.post.raw_json.token).toBe(obj.token);
  });

  it("stores every text field in raw_json, not just the typed five", async () => {
    // raw_json is the permanent ML corpus — extra Mailgun fields must survive.
    const obj = signedEmail({
      subject: "Dagens plats",
      sender: "truck@example.com",
      "stripped-text": "Vi står vid Järntorget",
    });

    const result = await prepareEmailIngest(obj, SIGNING_KEY, NOW_MS);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Everything Mailgun sent survives except the deliberately redacted signature.
    const withoutSignature = { ...obj };
    delete withoutSignature.signature;
    expect(result.post.raw_json).toEqual(withoutSignature);
    expect(result.post.raw_json.subject).toBe("Dagens plats");
  });

  it("normalises an uppercase recipient UUID to lowercase", async () => {
    const obj = signedEmail({
      recipient: `${TRUCK_ID.toUpperCase()}@IN.YOURAPP.SE`,
    });

    const result = await prepareEmailIngest(obj, SIGNING_KEY, NOW_MS);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.post.truck_id).toBe(TRUCK_ID);
    expect(getActiveTruckByIdMock).toHaveBeenCalledWith(TRUCK_ID);
  });

  it("accepts an empty body-plain (HTML-only mail still enters the corpus)", async () => {
    const obj = signedEmail({ "body-plain": "" });

    const result = await prepareEmailIngest(obj, SIGNING_KEY, NOW_MS);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.post.caption).toBe("");
  });
});

// ---------------------------------------------------------------------------
// persistPost
// ---------------------------------------------------------------------------

describe("persistPost", () => {
  const post: NewPost = {
    truck_id: TRUCK_ID,
    instagram_post_id: "IG_12345",
    caption: "Järntorget 11-14",
    source: "instagram",
    posted_at: "2026-08-09T10:00:00.000Z",
    raw_json: { caption: "Järntorget 11-14" },
    parsing_status: "pending",
  };

  it("delegates to insertPost", async () => {
    insertPostMock.mockResolvedValue({
      ...post,
      id: "post-id",
      created_at: "2026-08-09T10:00:01.000Z",
    });

    await expect(persistPost(post)).resolves.toBeUndefined();
    expect(insertPostMock).toHaveBeenCalledWith(post);
  });

  it("swallows a duplicate instagram_post_id (Postgres 23505) and logs it", async () => {
    // Dedup by instagram_post_id resolves as a benign discard — the route has
    // already sent its 200, so there is nothing to report to the caller. It is
    // logged because that makes it the ONLY visible trace: nothing surfaces to
    // Mailgun and no retry follows.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    insertPostMock.mockRejectedValue({
      code: "23505",
      message: 'duplicate key value violates unique constraint "posts_instagram_post_id_unique"',
    });

    await expect(persistPost(post)).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("discarded duplicate post"),
      "posts_instagram_post_id_unique",
    );
    warn.mockRestore();
  });

  it("names the email token constraint when a replay is discarded", async () => {
    // The two constraints must be distinguishable in logs: one is a benign
    // Instagram crosspost, the other is a replayed Mailgun token — or, if the
    // single-use-token assumption is ever wrong, a genuine email being dropped.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    insertPostMock.mockRejectedValue({
      code: "23505",
      details: 'Key ((raw_json ->> \'timestamp\'::text) || ...) already exists.',
      message: 'duplicate key value violates unique constraint "posts_email_token_unique"',
    });

    await expect(persistPost(post)).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("discarded duplicate post"),
      "posts_email_token_unique",
    );
    warn.mockRestore();
  });

  it("rethrows any other Postgres error", async () => {
    const err = { code: "23503", message: "foreign key violation" };
    insertPostMock.mockRejectedValue(err);

    await expect(persistPost(post)).rejects.toEqual(err);
  });

  it("rethrows a non-Postgres error (no code property)", async () => {
    const err = new Error("connection reset");
    insertPostMock.mockRejectedValue(err);

    await expect(persistPost(post)).rejects.toThrow("connection reset");
  });

  it("rethrows a null error without crashing the type guard", async () => {
    insertPostMock.mockRejectedValue(null);

    await expect(persistPost(post)).rejects.toBeNull();
  });
});
