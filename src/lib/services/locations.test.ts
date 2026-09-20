import { beforeEach, describe, expect, it, vi } from "vitest";

// The db layer and the geocoder are mocked, so `@/lib/supabase` is never imported and
// its top-level env guards never run — these stay true unit tests needing no local
// stack. Same pattern and same reason as `ingestion.test.ts`.
//
// ⚠ `isParseable` IS MOCKED AS A COLLABORATOR RATHER THAN EXERCISED FOR REAL, and that
// is a limit of this file worth stating instead of leaving for someone to discover.
// It is a pure predicate, but it lives in `db/posts.ts` (where the phase plan puts it)
// and that module imports `supabaseAdmin` at its top level — so importing the real one
// here would need the env this project deliberately does not give the unit project.
// Re-implementing its table in the mock factory is the alternative and is worse: a
// fold duplicated in a mock is drift this phase has already been caught by twice.
//
// So what this file pins is the WIRING — that the service asks, passes the post's own
// status, and writes nothing when the answer is no. The table itself is verified in
// the integration suite (#72), the same split `db/geocoding.ts`'s `cacheKey` records
// for the same reason.
vi.mock("@/lib/db/locations", () => ({
  insertLocation: vi.fn(),
  findOverlapping: vi.fn(),
  deleteLocations: vi.fn(),
}));
vi.mock("@/lib/db/posts", () => ({
  updateParsingStatus: vi.fn(),
  isParseable: vi.fn(),
}));
vi.mock("@/lib/db/trucks", () => ({ updateLastKnownPosition: vi.fn() }));
vi.mock("@/lib/geocoding", () => ({ geocode: vi.fn() }));

import { deleteLocations, findOverlapping, insertLocation } from "@/lib/db/locations";
import { isParseable, updateParsingStatus } from "@/lib/db/posts";
import { updateLastKnownPosition } from "@/lib/db/trucks";
import { geocode } from "@/lib/geocoding";
import { parseCaption } from "@/lib/parser";
import { sourceConfidence } from "@/lib/sources";
import {
  computeExpiresAt,
  parsedAtFor,
  writeLocationFromPost,
} from "@/lib/services/locations";
import type { Location, NewLocation, ParseResult, Post } from "@/lib/types";

const insertLocationMock = vi.mocked(insertLocation);
const findOverlappingMock = vi.mocked(findOverlapping);
const deleteLocationsMock = vi.mocked(deleteLocations);
const updateParsingStatusMock = vi.mocked(updateParsingStatus);
const isParseableMock = vi.mocked(isParseable);
const updateLastKnownPositionMock = vi.mocked(updateLastKnownPosition);
const geocodeMock = vi.mocked(geocode);

const TRUCK_ID = "11111111-1111-1111-1111-111111111111";
const POST_ID = "22222222-2222-2222-2222-222222222222";

// 2026-08-22 is a Saturday in CEST (UTC+2), so 11:00 Stockholm is 09:00Z. Summer is
// chosen on purpose: a UTC-equals-local fixture would pass whether or not the timezone
// handling works at all.
const PARSED_AT = "2026-08-22";
const POSTED_AT = "2026-08-22T09:00:00.000Z"; // 11:00 Stockholm

// The real dictionary entry, not a fixture — `extractLocation` resolves against the
// committed data and these tests go through the real `parseCaption` wherever the
// caption shape is what is under test.
const JARNTORGET = {
  lat: 57.6998935,
  lng: 11.952503,
  address:
    "Järntorget, Pustervik, Olivedal, Centrum, Göteborg, Göteborgs Stad, Västra Götalands län, 413 03, Sverige",
};

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: POST_ID,
    truck_id: TRUCK_ID,
    instagram_post_id: null,
    caption: "Vi står vid Järntorget 11-14",
    source: "instagram",
    posted_at: POSTED_AT,
    raw_json: {},
    parsing_status: "pending",
    created_at: "2026-08-22T09:00:01.000Z",
    ...overrides,
  };
}

function makeLocation(overrides: Partial<Location> = {}): Location {
  return {
    id: "33333333-3333-3333-3333-333333333333",
    truck_id: TRUCK_ID,
    post_id: null,
    latitude: 57.7,
    longitude: 11.95,
    address_raw: null,
    address_geocoded: null,
    starts_at: "2026-08-22T09:00:00+00:00",
    ends_at: "2026-08-22T12:00:00+00:00",
    // Deliberately Postgres's "+00:00" rendering rather than `toISOString()`'s ".000Z".
    // A stored row does not come back in the format the parser produced, and a test
    // that used the parser's format everywhere would never notice a string comparison.
    expires_at: "2026-08-22T12:00:00+00:00",
    source: "webhook",
    confidence: 0.85,
    parser_confidence: 1.0,
    source_confidence: 0.85,
    is_negation: false,
    // ⚠ EARLIER THAN THE DEFAULT POST'S `posted_at` (09:00:00Z). This fixture stands
    // for a location that ALREADY EXISTED when the post under test arrived — which is
    // the only kind `findOverlapping` returns — so it must predate it. The first
    // version used 09:00:01, one second AFTER, which is the shape of a row created BY
    // the post itself and a scenario this mock can never legitimately represent.
    //
    // Nothing in production reads this column today (PR #113 r2 removed the guard that
    // briefly did — see the replay-safety block and #114). Kept honest anyway: a
    // fixture that lies is cheap only until something reads the field.
    created_at: "2026-08-22T07:00:00+00:00",
    updated_at: "2026-08-22T07:00:00+00:00",
    ...overrides,
  };
}

// A `ParseResult` built by hand, for the tests whose subject is the service's logic
// rather than the parser's. Where the CAPTION is what is under test, the real
// `parseCaption` is used instead — see the expiry block.
function makeParseResult(overrides: Partial<ParseResult> = {}): ParseResult {
  return {
    isNegation: false,
    place: {
      kind: "dictionary",
      match: {
        entry: {
          id: "jarntorget",
          match: ["Järntorget", "Jarntorget"],
          address: JARNTORGET.address,
          lat: JARNTORGET.lat,
          lng: JARNTORGET.lng,
          source: "nominatim",
          verified: false,
        },
        matched: "Järntorget",
      },
    },
    date: PARSED_AT,
    time: {
      startsAt: "2026-08-22T09:00:00.000Z",
      endsAt: "2026-08-22T12:00:00.000Z",
      kind: "range",
    },
    parserConfidence: 1.0,
    ...overrides,
  };
}

// The payload handed to `insertLocation`, for assertions about the row itself.
function insertedRow(): NewLocation {
  expect(insertLocationMock).toHaveBeenCalledTimes(1);
  return insertLocationMock.mock.calls[0][0];
}

beforeEach(() => {
  vi.clearAllMocks();
  // The default world: the post may be parsed, nothing overlaps, the insert succeeds.
  // Each test changes only the one thing it is about.
  isParseableMock.mockReturnValue(true);
  findOverlappingMock.mockResolvedValue([]);
  insertLocationMock.mockImplementation(async (row) =>
    makeLocation({ ...row, id: "44444444-4444-4444-4444-444444444444" }),
  );
});

// ---------------------------------------------------------------------------
// parsedAtFor — the one derivation both callers share (plan hazard H3)
// ---------------------------------------------------------------------------

describe("parsedAtFor", () => {
  it("returns the Stockholm calendar date, not the UTC one", () => {
    // 22:30Z on the 21st is already 00:30 on the 22nd in Stockholm (CEST). Reading the
    // UTC date would give the wrong day, and every "idag" in that caption with it.
    expect(parsedAtFor(makePost({ posted_at: "2026-08-21T22:30:00.000Z" }))).toBe(
      "2026-08-22",
    );
  });

  it("handles the winter offset too", () => {
    // CET (UTC+1): 23:30Z on the 21st is 00:30 on the 22nd.
    expect(parsedAtFor(makePost({ posted_at: "2026-01-21T23:30:00.000Z" }))).toBe(
      "2026-01-22",
    );
  });

  it("accepts Postgres's +00:00 rendering, not only toISOString()'s Z", () => {
    expect(parsedAtFor(makePost({ posted_at: "2026-08-22T09:00:00+00:00" }))).toBe(
      "2026-08-22",
    );
  });

  it("returns null rather than throwing on an unreadable posted_at (#95)", () => {
    expect(parsedAtFor(makePost({ posted_at: "not-a-timestamp" }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The named "no location" exits (plan decision #9)
// ---------------------------------------------------------------------------

describe("writeLocationFromPost — the no-location exits", () => {
  it("never turns an unparseable post into a location, and leaves its status alone", async () => {
    // The Phase 3 dependency flagged in three separate docs: a stale-but-signed
    // Mailgun payload is KEPT and never acted on. Freshness governs whether we act,
    // never whether we store.
    isParseableMock.mockReturnValue(false);
    const post = makePost({ parsing_status: "skipped" });

    const outcome = await writeLocationFromPost(post, makeParseResult());

    expect(outcome).toEqual({ kind: "no-location", reason: "unparseable-post" });
    expect(insertLocationMock).not.toHaveBeenCalled();
    expect(deleteLocationsMock).not.toHaveBeenCalled();
    // ⚠ THE STATUS IS NOT OVERWRITTEN. `'skipped'` is load-bearing for monitoring the
    // freshness window; replacing it with `'parsed'` would destroy the only record of
    // why the post was never acted on.
    expect(updateParsingStatusMock).not.toHaveBeenCalled();
  });

  it("asks isParseable about the post's own status", async () => {
    isParseableMock.mockReturnValue(false);

    await writeLocationFromPost(makePost({ parsing_status: "skipped" }), makeParseResult());

    expect(isParseableMock).toHaveBeenCalledWith("skipped");
  });

  it("checks parseability before anything else reads the parse result", async () => {
    // Ordering matters: an unparseable post must not reach the geocoder either.
    isParseableMock.mockReturnValue(false);

    await writeLocationFromPost(
      makePost({ parsing_status: "skipped" }),
      makeParseResult({ place: { kind: "fallback", address: "Kungsgatan 12" } }),
    );

    expect(geocodeMock).not.toHaveBeenCalled();
  });

  it("never lets an unparseable post cancel anything", async () => {
    // ⚠ THE SECURITY-RELEVANT ORDERING. A replayed stale Mailgun payload reaching the
    // cancellation path would DELETE a truck's pins. `isParseable` runs before the
    // negation branch, so it cannot.
    isParseableMock.mockReturnValue(false);

    const outcome = await writeLocationFromPost(
      makePost({ parsing_status: "skipped", source: "email" }),
      makeParseResult({ isNegation: true, place: null, parserConfidence: 0 }),
    );

    expect(outcome).toEqual({ kind: "no-location", reason: "unparseable-post" });
    expect(findOverlappingMock).not.toHaveBeenCalled();
    expect(deleteLocationsMock).not.toHaveBeenCalled();
  });

  it("rejects an unreadable posted_at as invalid-date (#95)", async () => {
    const outcome = await writeLocationFromPost(
      makePost({ posted_at: "not-a-timestamp" }),
      makeParseResult(),
    );

    expect(outcome).toEqual({ kind: "no-location", reason: "invalid-date" });
    expect(insertLocationMock).not.toHaveBeenCalled();
    expect(updateParsingStatusMock).toHaveBeenCalledWith(POST_ID, "failed");
  });

  it("rejects a malformed ParseResult.date as invalid-date (#95)", async () => {
    // The exact case #95 describes: `extractDate` returns `parsedAt` untouched on
    // every non-match path, so a caller that derived it badly produces a placed,
    // scored result carrying garbage toward `locations.starts_at`, which is NOT NULL.
    const outcome = await writeLocationFromPost(
      makePost(),
      makeParseResult({ date: "not-a-date" }),
    );

    expect(outcome).toEqual({ kind: "no-location", reason: "invalid-date" });
    expect(insertLocationMock).not.toHaveBeenCalled();
    expect(updateParsingStatusMock).toHaveBeenCalledWith(POST_ID, "failed");
  });

  it("rejects a well-shaped but impossible date", async () => {
    // February 31st passes a `\d{4}-\d{2}-\d{2}` shape test and is not a day.
    // `addCalendarDays`'s round trip is what catches it, which is why this file
    // reuses that rather than writing a second date validator.
    const outcome = await writeLocationFromPost(
      makePost(),
      makeParseResult({ date: "2026-02-31" }),
    );

    expect(outcome).toEqual({ kind: "no-location", reason: "invalid-date" });
  });

  it("validates the date BEFORE the negation branch, so #69 inherits a usable window", async () => {
    // #69's cancellation window is built from the extracted date. Ordering the checks
    // this way means the delete path cannot be handed a date it cannot read.
    const outcome = await writeLocationFromPost(
      makePost(),
      makeParseResult({ isNegation: true, place: null, date: "not-a-date" }),
    );

    expect(outcome).toEqual({ kind: "no-location", reason: "invalid-date" });
  });

  it("writes no row for a caption that names no place, and marks it parsed", async () => {
    const outcome = await writeLocationFromPost(
      makePost({ caption: "Vi har nybakat bröd idag!" }),
      makeParseResult({ place: null, parserConfidence: 0.2 }),
    );

    expect(outcome).toEqual({ kind: "no-location", reason: "no-place" });
    expect(insertLocationMock).not.toHaveBeenCalled();
    // ⚠ `'parsed'`, NOT `'failed'`. Nothing failed — the caption genuinely has no
    // location in it. Filing these under `'failed'` would fill the retry bucket with
    // posts that can never succeed and make the geocode-outage signal unreadable.
    expect(updateParsingStatusMock).toHaveBeenCalledWith(POST_ID, "parsed");
  });

  it("makes zero network calls for a caption with no address candidate", async () => {
    await writeLocationFromPost(makePost(), makeParseResult({ place: null }));

    expect(geocodeMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Geocoding
// ---------------------------------------------------------------------------

describe("writeLocationFromPost — coordinate resolution", () => {
  it("resolves a dictionary hit with zero network calls", async () => {
    const outcome = await writeLocationFromPost(makePost(), makeParseResult());

    expect(geocodeMock).not.toHaveBeenCalled();
    expect(outcome.kind).toBe("inserted");
    expect(insertedRow()).toMatchObject({
      latitude: JARNTORGET.lat,
      longitude: JARNTORGET.lng,
    });
  });

  it("stores the matched caption substring as address_raw and the entry as address_geocoded", async () => {
    await writeLocationFromPost(
      makePost(),
      makeParseResult({
        place: {
          kind: "dictionary",
          match: {
            entry: {
              id: "jarntorget",
              match: ["Järntorget", "Jarntorget"],
              address: JARNTORGET.address,
              lat: JARNTORGET.lat,
              lng: JARNTORGET.lng,
              source: "nominatim",
              verified: false,
            },
            // The truck's own spelling, which is what `address_raw` is defined as —
            // not `entry.match[0]`, the canonical alias we recognised it by.
            matched: "jarntorget",
          },
        },
      }),
    );

    expect(insertedRow()).toMatchObject({
      address_raw: "jarntorget",
      address_geocoded: JARNTORGET.address,
    });
  });

  it("geocodes the extracted candidate on a dictionary miss", async () => {
    geocodeMock.mockResolvedValue({
      lat: 57.7,
      lng: 11.97,
      displayName: "Kungsgatan 12, Göteborg",
    });

    await writeLocationFromPost(
      makePost(),
      makeParseResult({
        place: { kind: "fallback", address: "Kungsgatan 12" },
        parserConfidence: 0.85,
      }),
    );

    expect(geocodeMock).toHaveBeenCalledExactlyOnceWith("Kungsgatan 12");
    expect(insertedRow()).toMatchObject({
      latitude: 57.7,
      longitude: 11.97,
      address_raw: "Kungsgatan 12",
      address_geocoded: "Kungsgatan 12, Göteborg",
    });
  });

  it("accepts a cache hit's null displayName without failing the insert (#103)", async () => {
    geocodeMock.mockResolvedValue({ lat: 57.7, lng: 11.97, displayName: null });

    const outcome = await writeLocationFromPost(
      makePost(),
      makeParseResult({ place: { kind: "fallback", address: "Kungsgatan 12" } }),
    );

    expect(outcome.kind).toBe("inserted");
    expect(insertedRow().address_geocoded).toBeNull();
  });

  it("writes no row, marks failed, and leaves last_known untouched on a geocode miss", async () => {
    geocodeMock.mockResolvedValue(null);

    const outcome = await writeLocationFromPost(
      makePost(),
      makeParseResult({ place: { kind: "fallback", address: "Nowherevägen 1" } }),
    );

    expect(outcome).toEqual({ kind: "no-location", reason: "geocode-failed" });
    expect(insertLocationMock).not.toHaveBeenCalled();
    expect(deleteLocationsMock).not.toHaveBeenCalled();
    expect(updateParsingStatusMock).toHaveBeenCalledWith(POST_ID, "failed");
    // ⚠ NEVER NULLED. "We could not resolve today's caption" is not "we have forgotten
    // where this truck has ever been" — the grey marker still needs its last position.
    expect(updateLastKnownPositionMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// The row
// ---------------------------------------------------------------------------

describe("writeLocationFromPost — the inserted row", () => {
  it("sets every NOT NULL column plus post_id", async () => {
    await writeLocationFromPost(makePost(), makeParseResult());

    // Written as an exact key set rather than a `toMatchObject`: the acceptance
    // criterion is that nothing is LEFT OUT, and a partial match cannot see an
    // omission. A column added by a later migration fails this until it is placed.
    expect(Object.keys(insertedRow()).sort()).toEqual(
      [
        "address_geocoded",
        "address_raw",
        "confidence",
        "ends_at",
        "expires_at",
        "is_negation",
        "latitude",
        "longitude",
        "parser_confidence",
        "post_id",
        "source",
        "source_confidence",
        "starts_at",
        "truck_id",
      ].sort(),
    );
  });

  it("links the location to the post it came from", async () => {
    await writeLocationFromPost(makePost(), makeParseResult());

    expect(insertedRow()).toMatchObject({ post_id: POST_ID, truck_id: TRUCK_ID });
  });

  it("never writes is_negation true — a cancellation writes no row at all (#1)", async () => {
    await writeLocationFromPost(makePost(), makeParseResult());

    expect(insertedRow().is_negation).toBe(false);
  });

  it("keeps ends_at null when the caption gave no closing time", async () => {
    await writeLocationFromPost(
      makePost(),
      makeParseResult({
        time: { startsAt: "2026-08-22T09:00:00.000Z", endsAt: null, kind: "start" },
        parserConfidence: 0.7,
      }),
    );

    // The inferred end lives in `expires_at`. Conflating the two would make a guess
    // indistinguishable from something the truck actually stated.
    expect(insertedRow().ends_at).toBeNull();
    expect(insertedRow().expires_at).not.toBeNull();
  });

  it("updates last_known only after a successful insert", async () => {
    await writeLocationFromPost(makePost(), makeParseResult());

    expect(updateLastKnownPositionMock).toHaveBeenCalledExactlyOnceWith(
      TRUCK_ID,
      JARNTORGET.lat,
      JARNTORGET.lng,
    );
    expect(updateParsingStatusMock).toHaveBeenCalledWith(POST_ID, "parsed");
  });

  describe("confidence", () => {
    // `posts.source` → lane → `source_confidence`, and the product that reaches the
    // column the map filters on.
    const cases = [
      { source: "instagram", lane: "webhook" },
      { source: "facebook", lane: "webhook" },
      { source: "tiktok", lane: "webhook" },
      { source: "webhook", lane: "webhook" },
      { source: "email", lane: "email" },
      { source: "manual", lane: "manual" },
    ] as const;

    it.each(cases)("maps $source to the $lane lane", async ({ source, lane }) => {
      await writeLocationFromPost(makePost({ source }), makeParseResult());

      expect(insertedRow().source).toBe(lane);
    });

    it.each(cases)(
      "stores confidence = parser × source for $source",
      async ({ source, lane }) => {
        await writeLocationFromPost(
          makePost({ source }),
          makeParseResult({ parserConfidence: 0.6 }),
        );

        const row = insertedRow();
        expect(row.parser_confidence).toBe(0.6);
        expect(row.source_confidence).toBe(sourceConfidence(lane));
        expect(row.confidence).toBe(0.6 * sourceConfidence(lane));
      },
    );
  });
});

// ---------------------------------------------------------------------------
// The override matrix
// ---------------------------------------------------------------------------

describe("writeLocationFromPost — the override matrix", () => {
  // `posts.source` values that map onto each lane, so the matrix can be driven
  // through the public entry point rather than by exporting the table.
  const POST_SOURCE: Record<Location["source"], Post["source"]> = {
    manual: "manual",
    webhook: "instagram",
    email: "email",
  };

  const LANES = ["manual", "webhook", "email"] as const;

  // All nine cells, as the documented rule states them.
  const EXPECTED: Record<
    Location["source"],
    Record<Location["source"], "replace" | "discard">
  > = {
    manual: { manual: "replace", webhook: "replace", email: "replace" },
    webhook: { manual: "discard", webhook: "discard", email: "replace" },
    email: { manual: "discard", webhook: "discard", email: "discard" },
  };

  for (const incoming of LANES) {
    for (const existing of LANES) {
      const expected = EXPECTED[incoming][existing];

      it(`${incoming} incoming vs ${existing} existing → ${expected}`, async () => {
        const overlapping = makeLocation({ id: "existing-1", source: existing });
        findOverlappingMock.mockResolvedValue([overlapping]);

        const outcome = await writeLocationFromPost(
          makePost({ source: POST_SOURCE[incoming] }),
          makeParseResult(),
        );

        if (expected === "replace") {
          expect(outcome.kind).toBe("inserted");
          expect(deleteLocationsMock).toHaveBeenCalledExactlyOnceWith(["existing-1"]);
        } else {
          expect(outcome).toEqual({ kind: "no-location", reason: "outranked" });
          expect(insertLocationMock).not.toHaveBeenCalled();
          expect(deleteLocationsMock).not.toHaveBeenCalled();
          // The parse itself succeeded; the matrix simply kept the existing pin.
          expect(updateParsingStatusMock).toHaveBeenCalledWith(POST_ID, "parsed");
        }
      });
    }
  }

  // ⚠ THE TABLE AND THE PROSE MUST NOT DRIFT. The documented rule is two sentences,
  // and the second test below is the one that matters: the obvious arithmetic
  // implementation disagrees with the first sentence on exactly one cell.
  //
  // ⚠ BOTH READ THE `EXPECTED` FIXTURE, NOT THE PRODUCTION `OVERRIDE` TABLE, which is
  // not exported — so neither can fail on a production change (PR #113 review r1, which
  // found the same shape in this file's cancellation sibling). They are one link in a
  // chain, not a guard on their own:
  //
  //   the nine parameterized cases above  →  production == EXPECTED
  //   these two                           →  EXPECTED   == CLAUDE.md's two sentences
  //
  // The first link catches a production change; these catch a fixture edited to match
  // a wrong implementation. Stated because their names read as though they check the
  // code, and a reader who believed that would over-trust them.
  it("agrees with 'manual always overrides' on every existing lane", () => {
    for (const existing of LANES) {
      expect(EXPECTED.manual[existing]).toBe("replace");
    }
  });

  it("agrees with 'higher source confidence replaces, same discards' on every non-manual cell", () => {
    for (const incoming of LANES) {
      for (const existing of LANES) {
        if (incoming === "manual") continue;
        const byConfidence =
          sourceConfidence(incoming) > sourceConfidence(existing) ? "replace" : "discard";
        expect(EXPECTED[incoming][existing]).toBe(byConfidence);
      }
    }
  });

  it("is the cell the arithmetic gets wrong: manual replaces manual", async () => {
    // `1.0 > 1.0` is false, so a pure `sourceConfidence` comparison would DISCARD a
    // truck owner correcting their own dashboard entry — silently, which is why the
    // matrix is a table and not a comparison.
    findOverlappingMock.mockResolvedValue([makeLocation({ id: "old", source: "manual" })]);

    const outcome = await writeLocationFromPost(
      makePost({ source: "manual" }),
      makeParseResult(),
    );

    expect(outcome.kind).toBe("inserted");
    expect(deleteLocationsMock).toHaveBeenCalledExactlyOnceWith(["old"]);
  });

  it("coexists with a non-overlapping window rather than replacing it", async () => {
    // Lunch 11-14 and dinner 18-21 are two legitimate slots for one truck. The db
    // layer decides overlap; this asserts the service does not delete what it was not
    // handed.
    findOverlappingMock.mockResolvedValue([]);

    const outcome = await writeLocationFromPost(makePost(), makeParseResult());

    expect(outcome.kind).toBe("inserted");
    expect(deleteLocationsMock).toHaveBeenCalledExactlyOnceWith([]);
  });

  it("replaces EVERY overlapping row when it beats them all", async () => {
    // `findOverlapping` is genuinely plural: 11:00-13:00 and 13:30-15:00 both overlap
    // an incoming 12:00-14:00 without overlapping each other.
    findOverlappingMock.mockResolvedValue([
      makeLocation({ id: "a", source: "email" }),
      makeLocation({ id: "b", source: "email" }),
    ]);

    const outcome = await writeLocationFromPost(makePost(), makeParseResult());

    expect(outcome.kind).toBe("inserted");
    expect(deleteLocationsMock).toHaveBeenCalledExactlyOnceWith(["a", "b"]);
  });

  it("discards entirely when it beats some overlapping rows but not all", async () => {
    // ⚠ THE CASE THE PAIRWISE RULE DOES NOT COVER. A webhook beats the email and loses
    // to the manual. Deleting the email and inserting anyway would leave a webhook pin
    // and a manual pin live in the same window — two conflicting answers, created by
    // the mechanism that exists to prevent exactly that.
    findOverlappingMock.mockResolvedValue([
      makeLocation({ id: "beatable", source: "email" }),
      makeLocation({ id: "unbeatable", source: "manual" }),
    ]);

    const outcome = await writeLocationFromPost(
      makePost({ source: "instagram" }),
      makeParseResult(),
    );

    expect(outcome).toEqual({ kind: "no-location", reason: "outranked" });
    expect(insertLocationMock).not.toHaveBeenCalled();
    expect(deleteLocationsMock).not.toHaveBeenCalled();
  });

  it("does not touch last_known when the incoming location is outranked", async () => {
    findOverlappingMock.mockResolvedValue([makeLocation({ source: "manual" })]);

    await writeLocationFromPost(makePost({ source: "email" }), makeParseResult());

    expect(updateLastKnownPositionMock).not.toHaveBeenCalled();
  });

  it("queries overlap on the incoming row's own effective end", async () => {
    await writeLocationFromPost(makePost(), makeParseResult());

    const row = insertedRow();
    expect(findOverlappingMock).toHaveBeenCalledExactlyOnceWith(
      TRUCK_ID,
      row.starts_at,
      row.expires_at,
    );
  });

  it("inserts before deleting, so a failed write cannot leave the truck with no pin", async () => {
    // The order only matters when the second call fails, and the two failures are not
    // equally bad: delete-then-insert loses the pin outright, insert-then-delete
    // leaves two — visible, and resolved by the next post through this same matrix.
    const calls: string[] = [];
    findOverlappingMock.mockResolvedValue([makeLocation({ id: "old", source: "email" })]);
    insertLocationMock.mockImplementation(async (row) => {
      calls.push("insert");
      return makeLocation(row);
    });
    deleteLocationsMock.mockImplementation(async () => {
      calls.push("delete");
    });

    await writeLocationFromPost(makePost(), makeParseResult());

    expect(calls).toEqual(["insert", "delete"]);
  });
});

// ---------------------------------------------------------------------------
// The cancellation path (#69, plan decisions #1 and #6)
// ---------------------------------------------------------------------------

describe("writeLocationFromPost — cancellations", () => {
  const POST_SOURCE: Record<Location["source"], Post["source"]> = {
    manual: "manual",
    webhook: "instagram",
    email: "email",
  };

  const LANES = ["manual", "webhook", "email"] as const;

  // All nine cells. ⚠ IDENTICAL TO THE OVERRIDE TABLE EXCEPT ON THE DIAGONAL, which is
  // the `>=` of decision #6 — a truck must be able to retract through the lane it
  // posted from.
  const EXPECTED: Record<
    Location["source"],
    Record<Location["source"], "cancel" | "keep">
  > = {
    manual: { manual: "cancel", webhook: "cancel", email: "cancel" },
    webhook: { manual: "keep", webhook: "cancel", email: "cancel" },
    email: { manual: "keep", webhook: "keep", email: "cancel" },
  };

  function negation(overrides: Partial<ParseResult> = {}): ParseResult {
    return makeParseResult({
      isNegation: true,
      place: null,
      time: null,
      parserConfidence: 0,
      ...overrides,
    });
  }

  for (const cancelling of LANES) {
    for (const existing of LANES) {
      const expected = EXPECTED[cancelling][existing];

      it(`${cancelling} negation vs ${existing} location → ${expected}`, async () => {
        findOverlappingMock.mockResolvedValue([
          makeLocation({ id: "target", source: existing }),
        ]);

        const outcome = await writeLocationFromPost(
          makePost({ source: POST_SOURCE[cancelling] }),
          negation(),
        );

        const deleted = expected === "cancel" ? ["target"] : [];
        expect(outcome).toEqual({ kind: "cancelled", deleted });
        expect(deleteLocationsMock).toHaveBeenCalledExactlyOnceWith(deleted);
        expect(insertLocationMock).not.toHaveBeenCalled();
      });
    }
  }

  it("a webhook negation cancels a webhook location — 0.85 >= 0.85 (decision #6)", async () => {
    // ⚠ THE NAMED TEST DECISION #6 ASKS FOR, AND THE REASON IT IS NAMED. The `>=` reads
    // like a typo next to the insert path's `>`, and "fixing" it to `>` would make this
    // comparison 0.85 > 0.85 → false, discarding the cancellation. A truck that posts
    // through Make.com could then never retract through Make.com — silently, on the
    // most common cancellation path there is.
    findOverlappingMock.mockResolvedValue([
      makeLocation({ id: "own-pin", source: "webhook" }),
    ]);

    const outcome = await writeLocationFromPost(
      makePost({ source: "instagram" }),
      negation(),
    );

    expect(outcome).toEqual({ kind: "cancelled", deleted: ["own-pin"] });
  });

  it("the EXPECTED fixture matches decision #6 — `>=`, differing from `>` on the diagonal", () => {
    // ⚠ THIS TEST READS THE FIXTURE ABOVE, NOT THE PRODUCTION TABLE, and saying so is
    // the point (PR #113 review r1). `CANCELLATION` is not exported, so nothing here
    // can compare against it directly — flipping the production diagonal to `keep`
    // leaves THIS test green.
    //
    // It is not therefore useless, but its value is one link in a chain rather than a
    // guard on its own:
    //
    //   the nine parameterized cases above  →  production == EXPECTED
    //   this test                           →  EXPECTED   == decision #6
    //   ∴                                      production == decision #6
    //
    // The first link is what fails when production changes; verified by mutation —
    // flipping the diagonal turns those cells and the named `>=` test red. This link
    // is what fails when someone edits the fixture to match a wrong implementation,
    // which is the other way the pair can drift.
    for (const cancelling of LANES) {
      for (const existing of LANES) {
        const cancels = EXPECTED[cancelling][existing] === "cancel";
        // The INSERT rule, for comparison: manual always, else strictly greater.
        const replaces =
          cancelling === "manual" ||
          sourceConfidence(cancelling) > sourceConfidence(existing);

        if (cancelling === existing) {
          // The whole of decision #6: equal lanes cancel where they would not replace.
          expect(cancels, `${cancelling} must be able to retract its own post`).toBe(true);
        } else {
          // Off the diagonal, `>` and `>=` agree — so any difference here would be a
          // second, undocumented divergence.
          expect(cancels, `${cancelling} vs ${existing} must match the insert rule`).toBe(
            replaces,
          );
        }
      }
    }
  });

  it("an email negation cannot cancel a webhook or a manual location", async () => {
    // The #1 security property: Mailgun's HMAC authenticates the relay, never the
    // content, so a forged email must not be able to delete a truck's pins.
    findOverlappingMock.mockResolvedValue([
      makeLocation({ id: "webhook-pin", source: "webhook" }),
      makeLocation({ id: "manual-pin", source: "manual" }),
    ]);

    const outcome = await writeLocationFromPost(makePost({ source: "email" }), negation());

    expect(outcome).toEqual({ kind: "cancelled", deleted: [] });
    expect(deleteLocationsMock).toHaveBeenCalledExactlyOnceWith([]);
  });

  it("deletes the rows it may and leaves the rest, unlike the all-or-nothing insert path", async () => {
    // ⚠ THE ASYMMETRY WITH `overridesAll`, ASSERTED. An insert must beat EVERY
    // overlapping row or it discards, because inserting while losing to one would
    // create two conflicting pins. A cancellation creates nothing, so cancelling what
    // it is entitled to and leaving the rest produces no conflict.
    findOverlappingMock.mockResolvedValue([
      makeLocation({ id: "its-own", source: "webhook" }),
      makeLocation({ id: "a-manual-one", source: "manual" }),
    ]);

    const outcome = await writeLocationFromPost(
      makePost({ source: "instagram" }),
      negation(),
    );

    expect(outcome).toEqual({ kind: "cancelled", deleted: ["its-own"] });
  });

  describe("replay safety (plan decision #7) — NOT guarded here, see #114", () => {
    // ⚠ THIS BLOCK PINS A KNOWN HAZARD RATHER THAN A GUARD, and it says so because a
    // reader who assumed otherwise would be badly wrong.
    //
    // Decision #7 says "the priority matrix already covers" replay safety. It covers
    // the INSERT path — `OVERRIDE.webhook.webhook` is `discard` — and INVERTS here,
    // because `CANCELLATION.webhook.webhook` is `cancel`. #6's `>=` is what makes them
    // differ, and #7 predates that table.
    //
    // PR #113 r1 added a `created_at <= posted_at` guard for this and r2 removed it:
    // under a #71 replay every re-inserted location carries `created_at = now`, later
    // than every replayed cancellation's `posted_at`, so no cancellation could cancel
    // and replaying a day RESURRECTED every pin it had cancelled — the inverse of the
    // defect. #114 carries the correct fix, which needs the originating post's
    // `posted_at` via `locations.post_id`.
    it("cancels a row regardless of when it was created — the #114 baseline", async () => {
      findOverlappingMock.mockResolvedValue([
        makeLocation({
          id: "created-later",
          source: "webhook",
          // Later than the post's `posted_at`, which is what a #71 replay produces.
          created_at: "2026-09-20T15:00:00+00:00",
        }),
      ]);

      const outcome = await writeLocationFromPost(
        makePost({ posted_at: "2026-08-22T10:00:00.000Z" }),
        negation(),
      );

      // Current behaviour, asserted so #114 has a baseline to change rather than a
      // scenario to reconstruct. On the live path this is correct — `findOverlapping`
      // only returns rows that already exist. Under replay it is the hazard.
      expect(outcome).toEqual({ kind: "cancelled", deleted: ["created-later"] });
    });
  });

  it("is a silent no-op when nothing matches", async () => {
    findOverlappingMock.mockResolvedValue([]);

    const outcome = await writeLocationFromPost(makePost(), negation());

    expect(outcome).toEqual({ kind: "cancelled", deleted: [] });
    expect(updateParsingStatusMock).toHaveBeenCalledWith(POST_ID, "parsed");
  });

  it("marks the post parsed", async () => {
    findOverlappingMock.mockResolvedValue([makeLocation({ source: "webhook" })]);

    await writeLocationFromPost(makePost(), negation());

    expect(updateParsingStatusMock).toHaveBeenCalledExactlyOnceWith(POST_ID, "parsed");
  });

  it("never touches last_known — a cancellation carries no position", async () => {
    findOverlappingMock.mockResolvedValue([makeLocation({ source: "webhook" })]);

    await writeLocationFromPost(makePost(), negation());

    // Not updated, and above all not nulled: a truck taking a day off must not lose
    // the grey marker that says where it usually is.
    expect(updateLastKnownPositionMock).not.toHaveBeenCalled();
  });

  it("never geocodes — a negation has no place to resolve", async () => {
    await writeLocationFromPost(makePost(), negation());

    expect(geocodeMock).not.toHaveBeenCalled();
  });

  describe("the cancellation window", () => {
    it("covers the full Stockholm day when the caption gave no time", async () => {
      await writeLocationFromPost(makePost(), negation({ date: PARSED_AT }));

      const [truckId, from, to] = findOverlappingMock.mock.calls[0];
      expect(truckId).toBe(TRUCK_ID);
      // 00:00 and 24:00 Stockholm on 2026-08-22 (CEST, UTC+2).
      expect(from).toBe("2026-08-21T22:00:00.000Z");
      expect(to).toBe("2026-08-22T22:00:00.000Z");
    });

    it("uses the stated range when there is one", async () => {
      await writeLocationFromPost(
        makePost(),
        negation({
          time: {
            startsAt: "2026-08-22T09:00:00.000Z",
            endsAt: "2026-08-22T12:00:00.000Z",
            kind: "range",
          },
        }),
      );

      const [, from, to] = findOverlappingMock.mock.calls[0];
      expect(from).toBe("2026-08-22T09:00:00.000Z");
      expect(to).toBe("2026-08-22T12:00:00.000Z");
    });

    it("runs an open-ended cancellation to the end of the day it named", async () => {
      // "Inställt från 14" — the caption stated no close, and for a retraction the
      // honest reading is "from then on", bounded by that day.
      await writeLocationFromPost(
        makePost(),
        negation({
          time: {
            startsAt: "2026-08-22T12:00:00.000Z",
            endsAt: null,
            kind: "start",
          },
        }),
      );

      const [, from, to] = findOverlappingMock.mock.calls[0];
      expect(from).toBe("2026-08-22T12:00:00.000Z");
      expect(to).toBe("2026-08-22T22:00:00.000Z");
    });

    it("cancels the day the caption named, not the day it was posted", async () => {
      await writeLocationFromPost(makePost(), negation({ date: "2026-08-23" }));

      const [, from, to] = findOverlappingMock.mock.calls[0];
      expect(from).toBe("2026-08-22T22:00:00.000Z"); // 00:00 on the 23rd
      expect(to).toBe("2026-08-23T22:00:00.000Z"); // 24:00 on the 23rd
    });

    it("handles the winter offset", () => {
      // CET (UTC+1). Asserted through computeExpiresAt, which shares the boundary.
      expect(computeExpiresAt("2026-01-15T19:00:00.000Z", null, "2026-01-15")).toBe(
        "2026-01-15T23:00:00.000Z",
      );
    });

    it("refuses to build a window from a date it cannot read", async () => {
      // The reason the date checks run BEFORE the negation branch: a DELETE must never
      // be issued against a window built from garbage.
      const outcome = await writeLocationFromPost(
        makePost(),
        negation({ date: "not-a-date" }),
      );

      expect(outcome).toEqual({ kind: "no-location", reason: "invalid-date" });
      expect(findOverlappingMock).not.toHaveBeenCalled();
      expect(deleteLocationsMock).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// Expiry (plan decision #5)
// ---------------------------------------------------------------------------

describe("computeExpiresAt", () => {
  it("does not cap an explicitly extracted end", () => {
    // "Vi står vid Järntorget 22-01" — an ordinary late-night pattern here, and
    // truncating it at 23:59 would discard something the truck actually stated. The
    // cap constrains what the system INFERS, never what it was told.
    const endsAt = "2026-08-23T23:00:00.000Z"; // 01:00 Stockholm on the 23rd

    expect(computeExpiresAt("2026-08-22T20:00:00.000Z", endsAt, PARSED_AT)).toBe(endsAt);
  });

  it("caps the inferred fallback at midnight of the start's Stockholm day", () => {
    // Posted 20:00 Stockholm with no end: +8h would be 04:00 the next morning, with no
    // evidence the truck is still there. The cap is what stops that.
    const startsAt = "2026-08-22T18:00:00.000Z"; // 20:00 Stockholm

    const expiresAt = computeExpiresAt(startsAt, null, PARSED_AT);

    // Midnight ENDING 2026-08-22 Stockholm (CEST, UTC+2) = 22:00:00Z.
    expect(expiresAt).toBe("2026-08-22T22:00:00.000Z");
  });

  it("does not expire before a start carrying milliseconds (PR #107 r1)", () => {
    // ⚠ THE REGRESSION. `posted_at` is `new Date().toISOString()` on the webhook lane,
    // so a same-day no-time caption's `starts_at` carries milliseconds. Against the
    // old `23:59:59.000` boundary a caption posted in a day's final second produced an
    // `expires_at` 500 ms BEFORE its own `starts_at` — a row born expired.
    const startsAt = "2026-08-22T21:59:59.500Z"; // 23:59:59.500 Stockholm

    const expiresAt = computeExpiresAt(startsAt, null, PARSED_AT);

    expect(Date.parse(expiresAt)).toBeGreaterThan(Date.parse(startsAt));
    expect(expiresAt).toBe("2026-08-22T22:00:00.000Z");
  });

  it("gives a future-dated caption with no time the whole day (PR #107 r1)", () => {
    // 00:00 Stockholm on the 23rd. Under the 8h rule this expired at 08:00 local —
    // live only overnight, gone before anyone looked for lunch.
    const startsAt = "2026-08-22T22:00:00.000Z";

    const expiresAt = computeExpiresAt(startsAt, null, "2026-08-23", "whole-day");

    // Midnight ending the 23rd, not 08:00 that morning.
    expect(expiresAt).toBe("2026-08-23T22:00:00.000Z");
  });

  it("still applies the 8h guess when the caption stated an opening hour", () => {
    // "imorgon kl 11" — a future day, but a time the truck actually named, so the
    // window anchors to it rather than to the day.
    const startsAt = "2026-08-23T09:00:00.000Z"; // 11:00 Stockholm on the 23rd

    expect(computeExpiresAt(startsAt, null, "2026-08-23", "from-start")).toBe(
      "2026-08-23T17:00:00.000Z",
    );
  });

  it("throws on an unreadable date rather than a RangeError three steps later", () => {
    expect(() => computeExpiresAt("2026-08-22T09:00:00.000Z", null, "not-a-date")).toThrow(
      /unreadable date/,
    );
  });

  it("uses the 8h window when it lands before midnight", () => {
    const startsAt = "2026-08-22T09:00:00.000Z"; // 11:00 Stockholm

    expect(computeExpiresAt(startsAt, null, PARSED_AT)).toBe("2026-08-22T17:00:00.000Z");
  });

  it("compares instants, not strings, when picking the smaller end", () => {
    // Postgres's "+00:00" and the parser's ".000Z" are the same instant in different
    // text. A string comparison orders these correctly only by coincidence.
    expect(computeExpiresAt("2026-08-22T18:00:00+00:00", null, PARSED_AT)).toBe(
      "2026-08-22T22:00:00.000Z",
    );
  });

  it("caps at the start's day, not the posting day — the 'imorgon' case (#5a)", () => {
    // A caption posted today about tomorrow: the cap must be tomorrow's midnight, or
    // the location expires tonight, before its own starts_at, and is never visible.
    const startsAt = "2026-08-23T09:00:00.000Z"; // 11:00 Stockholm on the 23rd

    expect(computeExpiresAt(startsAt, null, "2026-08-23")).toBe(
      "2026-08-23T17:00:00.000Z",
    );
  });

  it("never expires before its own starts_at", () => {
    // The property behind every case above, asserted as a property.
    //
    // ⚠ EVERY FIXTURE IN THE FIRST VERSION OF THIS TEST HAD `.000` MILLISECONDS, which
    // is exactly why it passed while the sub-second boundary hole was live (PR #107
    // r1). A property test whose inputs all share the shape the property is most
    // fragile against proves less than it appears to. The sub-second and last-instant
    // rows below are the ones that were missing, and they are deliberately awkward.
    const shapes = [
      { startsAt: "2026-08-22T09:00:00.000Z", date: "2026-08-22", window: "from-start" },
      { startsAt: "2026-08-22T18:00:00.000Z", date: "2026-08-22", window: "from-start" },
      { startsAt: "2026-08-22T21:50:00.000Z", date: "2026-08-22", window: "from-start" },
      { startsAt: "2026-01-15T10:00:00.000Z", date: "2026-01-15", window: "from-start" },
      // Sub-second, at and either side of the old 23:59:59 boundary.
      { startsAt: "2026-08-22T21:59:59.001Z", date: "2026-08-22", window: "from-start" },
      { startsAt: "2026-08-22T21:59:59.500Z", date: "2026-08-22", window: "from-start" },
      { startsAt: "2026-08-22T21:59:59.999Z", date: "2026-08-22", window: "from-start" },
      { startsAt: "2026-08-22T21:58:30.250Z", date: "2026-08-22", window: "from-start" },
      // The future-dated day window, both kinds.
      { startsAt: "2026-08-22T22:00:00.000Z", date: "2026-08-23", window: "whole-day" },
      { startsAt: "2026-08-23T09:00:00.000Z", date: "2026-08-23", window: "from-start" },
      // Winter, and a winter sub-second instant.
      { startsAt: "2026-01-15T22:59:59.750Z", date: "2026-01-15", window: "from-start" },
      // The DST transition days themselves — Sweden switches at 03:00 local, so a day
      // is 23 or 25 hours long and "midnight" must still be computed, never added.
      { startsAt: "2026-03-29T12:00:00.000Z", date: "2026-03-29", window: "from-start" },
      { startsAt: "2026-10-25T12:00:00.000Z", date: "2026-10-25", window: "from-start" },
    ] as const;

    for (const { startsAt, date, window } of shapes) {
      const expiresAt = computeExpiresAt(startsAt, null, date, window);
      expect(
        Date.parse(expiresAt),
        `${startsAt} (${window}) expired at ${expiresAt}`,
      ).toBeGreaterThan(Date.parse(startsAt));
    }
  });

  it("handles the winter offset", () => {
    // CET (UTC+1): midnight ending 2026-01-15 Stockholm is 23:00:00Z.
    expect(computeExpiresAt("2026-01-15T19:00:00.000Z", null, "2026-01-15")).toBe(
      "2026-01-15T23:00:00.000Z",
    );
  });
});

// ---------------------------------------------------------------------------
// End to end through the real parser
// ---------------------------------------------------------------------------

// These go through `parseCaption` rather than a hand-built `ParseResult`, so the
// handoff between the two modules is under test and not merely assumed — the same
// reason `date.ts`'s tests assert the composition with `normalize.ts`.
describe("writeLocationFromPost — real captions", () => {
  // ⚠ `posts.caption` IS NULLABLE, so the caption is held as a local `string` here
  // rather than read back off the post. Not a test detail: whatever calls the parser
  // (#70's wiring, #71's replay) has to decide what a null caption means before it can
  // call `parseCaption` at all, and this service never sees that decision — it is
  // handed a `ParseResult` that already exists.
  function parsed(caption: string, overrides: Partial<Post> = {}) {
    return {
      post: makePost({ caption, ...overrides }),
      parseResult: parseCaption(caption, PARSED_AT),
    };
  }

  it("pins the phase's canonical caption at full confidence", async () => {
    const { post, parseResult } = parsed("Idag lunch vid Järntorget 11-14 🌮 #gbg");

    const outcome = await writeLocationFromPost(post, parseResult);

    expect(outcome.kind).toBe("inserted");
    expect(insertedRow()).toMatchObject({
      latitude: JARNTORGET.lat,
      longitude: JARNTORGET.lng,
      starts_at: "2026-08-22T09:00:00.000Z", // 11:00 Stockholm
      ends_at: "2026-08-22T12:00:00.000Z", // 14:00 Stockholm
      parser_confidence: 1.0,
      source: "webhook",
      confidence: 0.85,
    });
  });

  it("expires 'imorgon lunch 11-14' tomorrow at 14:00, not tonight", async () => {
    const { post, parseResult } = parsed("Imorgon lunch vid Järntorget 11-14");

    await writeLocationFromPost(post, parseResult);

    const row = insertedRow();
    expect(row.starts_at).toBe("2026-08-23T09:00:00.000Z");
    // An explicit end, so uncapped — and, critically, after its own start.
    expect(row.expires_at).toBe("2026-08-23T12:00:00.000Z");
    expect(Date.parse(row.expires_at)).toBeGreaterThan(Date.parse(row.starts_at));
  });

  it("rolls a midnight-crossing window and expires at the stated close", async () => {
    const { post, parseResult } = parsed("Vi står vid Järntorget 22-01");

    await writeLocationFromPost(post, parseResult);

    const row = insertedRow();
    expect(row.ends_at).toBe("2026-08-22T23:00:00.000Z"); // 01:00 Stockholm, next day
    expect(row.expires_at).toBe(row.ends_at); // uncapped
    expect(Date.parse(row.expires_at)).toBeGreaterThan(Date.parse(row.starts_at));
  });

  it("starts a same-day no-time caption at the post time", async () => {
    // "The truck is there NOW" — the post itself is the start, and the 8h fallback
    // runs from it, which is the plan's `posted_at + 8h` exactly.
    const { post, parseResult } = parsed("Vi står vid Järntorget");

    await writeLocationFromPost(post, parseResult);

    const row = insertedRow();
    expect(row.starts_at).toBe(POSTED_AT);
    expect(row.ends_at).toBeNull();
    expect(row.expires_at).toBe("2026-08-22T17:00:00.000Z"); // 11:00 + 8h
    expect(row.parser_confidence).toBe(0.6);
  });

  it("gives a future-dated no-time caption the whole day it names", async () => {
    // ⚠ THE CASE THE PLAN'S LITERAL `posted_at + 8h` GETS WRONG. Posted 11:00 today
    // about tomorrow: `posted_at + 8h` is 19:00 TONIGHT, which is before this
    // location's own starts_at of tomorrow 00:00 — a row that expired before it began
    // and would never be visible for a single second. That is precisely the defect
    // decision #5(a) was written to prevent, reached through the other term.
    //
    // ⚠ AND `expires_at > starts_at` IS NOT ENOUGH TO PIN IT, which is what this test
    // asserted in its first version (PR #107 r1). `starts_at + 8h` satisfies that
    // while putting the whole window at 00:00–08:00 local — the pin is live only
    // overnight and gone before anyone looks for lunch. Passing that assertion while
    // being useless for its entire life is why the window is now asserted end to end.
    const { post, parseResult } = parsed("Vi står vid Järntorget imorgon");

    await writeLocationFromPost(post, parseResult);

    const row = insertedRow();
    expect(row.starts_at).toBe("2026-08-22T22:00:00.000Z"); // 00:00 Stockholm, 23rd
    expect(row.expires_at).toBe("2026-08-23T22:00:00.000Z"); // midnight ending the 23rd
    expect(Date.parse(row.expires_at)).toBeGreaterThan(Date.parse(row.starts_at));

    // The hours a person would actually look: live across the whole of the 23rd.
    const lunchtime = Date.parse("2026-08-23T10:00:00.000Z"); // 12:00 Stockholm
    expect(Date.parse(row.starts_at)).toBeLessThan(lunchtime);
    expect(Date.parse(row.expires_at)).toBeGreaterThan(lunchtime);
  });

  it("cancels the whole day for 'Inställt idag', writing no row", async () => {
    const { post, parseResult } = parsed("Inställt idag tyvärr!");
    expect(parseResult.isNegation).toBe(true);

    findOverlappingMock.mockResolvedValue([
      makeLocation({ id: "lunch", source: "webhook" }),
      makeLocation({ id: "dinner", source: "webhook" }),
    ]);

    const outcome = await writeLocationFromPost(post, parseResult);

    expect(outcome).toEqual({ kind: "cancelled", deleted: ["lunch", "dinner"] });
    expect(insertLocationMock).not.toHaveBeenCalled();
    // Both slots, not one and not zero — the full-day window is the point of #1.
    expect(deleteLocationsMock).toHaveBeenCalledExactlyOnceWith(["lunch", "dinner"]);
  });

  it("cancels only the stated range for 'Inställt 11-14 idag'", async () => {
    // The dinner pin survives because the query window never reaches it. This is the
    // defect `parser/index.ts` fixed — its first version dropped `time` on a negation,
    // so this caption would have fallen through to the full-day rule.
    const { post, parseResult } = parsed("Inställt 11-14 idag");
    expect(parseResult.isNegation).toBe(true);
    expect(parseResult.time).not.toBeNull();

    await writeLocationFromPost(post, parseResult);

    const [, from, to] = findOverlappingMock.mock.calls[0];
    expect(Date.parse(from)).toBe(Date.parse("2026-08-22T09:00:00.000Z")); // 11:00
    expect(Date.parse(to)).toBe(Date.parse("2026-08-22T12:00:00.000Z")); // 14:00
  });

  it("scores an email-lane geocoded address above the display threshold", async () => {
    // Plan decision #3's sanity check: 0.85 × 0.55 = 0.4675, just above the 0.45 line,
    // so it renders yellow rather than vanishing.
    geocodeMock.mockResolvedValue({ lat: 57.7, lng: 11.97, displayName: "Kungsgatan 12" });
    const { post, parseResult } = parsed("Vi står på Kungsgatan 12 11-14", {
      source: "email",
    });

    await writeLocationFromPost(post, parseResult);

    const row = insertedRow();
    expect(row.parser_confidence).toBe(0.85);
    expect(row.confidence).toBeGreaterThan(0.45);
  });
});
