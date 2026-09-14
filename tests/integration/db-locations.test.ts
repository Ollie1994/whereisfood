import { beforeEach, describe, expect, it } from "vitest";
import { deleteLocations, findOverlapping, insertLocation } from "@/lib/db/locations";
import type { NewLocation } from "@/lib/types";
import { resetTables, seedTruck } from "./helpers";

// ⚠ INTEGRATION RATHER THAN UNIT, AND THAT IS THE WHOLE POINT OF THE FILE. The defect
// this PR corrects is SQL's three-valued logic: a comparison against a NULL column
// yields NULL, and `WHERE NULL` drops the row. A mocked Supabase client cannot exhibit
// that — it would return whatever the mock was told to, so a unit test here would assert
// the mock and pass against the broken predicate.
//
// Postgres is the thing under test as much as the query is.

// A Saturday, and the window every case is built around: 11:00–14:00 Stockholm (CEST),
// stored UTC.
const LUNCH_START = "2026-08-22T09:00:00.000Z";
const LUNCH_END = "2026-08-22T12:00:00.000Z";

let truckId: string;

beforeEach(async () => {
  await resetTables();
  truckId = await seedTruck();
});

// Every NOT NULL column set explicitly — the phase plan lists that as an acceptance
// criterion because a silent default is how a row ends up scored 0 or flagged wrong.
function aLocation(overrides: Partial<NewLocation> = {}): NewLocation {
  return {
    truck_id: truckId,
    post_id: null,
    latitude: 57.6998935,
    longitude: 11.952503,
    address_raw: "Järntorget",
    address_geocoded: "Järntorget, Göteborg",
    starts_at: LUNCH_START,
    ends_at: LUNCH_END,
    expires_at: LUNCH_END,
    source: "webhook",
    confidence: 0.85,
    parser_confidence: 1.0,
    source_confidence: 0.85,
    is_negation: false,
    ...overrides,
  };
}

describe("insertLocation", () => {
  it("returns the stored row including its generated id", async () => {
    const stored = await insertLocation(aLocation());

    // The id is what the service needs for `locations.post_id` bookkeeping and for a
    // later delete; without `.select().single()` PostgREST returns no body and the
    // caller would have to re-query for a row it just created.
    expect(stored.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(stored.truck_id).toBe(truckId);

    // ⚠ COMPARED AS AN INSTANT, NOT AS A STRING, AND THIS IS NOT A TEST DETAIL.
    // Postgres returns `timestamptz` as `2026-08-22T09:00:00+00:00`; we sent
    // `2026-08-22T09:00:00.000Z`. Same moment, different text — so a round trip does
    // NOT preserve the string, verified here rather than assumed.
    //
    // It matters for #68, which compares an incoming location's window against stored
    // rows: `stored.expires_at === parsed.startsAt` is false for identical instants,
    // and `<` / `>` between the two formats compares text that only coincidentally
    // orders correctly. Ordering within ONE format is fine, which is what makes this
    // easy to get away with until it is not.
    expect(Date.parse(stored.starts_at)).toBe(Date.parse(LUNCH_START));
    expect(stored.starts_at).not.toBe(LUNCH_START);
  });

  it("propagates a Postgres error rather than swallowing it", async () => {
    // Interpreting an error needs context this layer does not have — a 23505 that means
    // a benign replay versus a constraint violation that means a bug. `source` is
    // constrained by `locations_source_check`, so this is a real constraint talking.
    await expect(
      insertLocation(aLocation({ source: "carrier-pigeon" as NewLocation["source"] })),
    ).rejects.toMatchObject({ code: expect.any(String) });
  });
});

describe("findOverlapping", () => {
  it("⚠ finds a location whose ends_at is NULL — the H4 regression", async () => {
    // THE REASON THIS PR EXISTS. The documented predicate was
    //
    //   existing.starts_at < incoming.ends_at AND existing.ends_at > incoming.starts_at
    //
    // and `ends_at` is nullable by design (migration 0002: "the expiry rule explicitly
    // handles 'no ends_at extracted'"). Under three-valued logic that predicate cannot
    // see this row, so a 0.55 email pin would be permanently unreplaceable — not even a
    // manual post could override it — and duplicate pins would accumulate for the same
    // truck and window.
    //
    // Not an edge case: this is the `location only (no time)` row of the confidence
    // matrix, produced by an ordinary caption like "Vi står vid Järntorget idag".
    await insertLocation(aLocation({ ends_at: null, expires_at: LUNCH_END }));

    const found = await findOverlapping(truckId, LUNCH_START, LUNCH_END);

    expect(found).toHaveLength(1);
    expect(found[0].ends_at).toBeNull();
  });

  it("finds an ordinary location with an ends_at", async () => {
    await insertLocation(aLocation());

    expect(await findOverlapping(truckId, LUNCH_START, LUNCH_END)).toHaveLength(1);
  });

  it.each([
    ["ends_at set", LUNCH_END],
    ["ends_at NULL", null],
  ])("does not find a non-overlapping window — %s", async (_label, endsAt) => {
    // Dinner, hours after lunch. The NULL row is the one that matters: the fix must not
    // make every null-ended location match everything, which would be the opposite
    // error and just as wrong.
    await insertLocation(
      aLocation({
        starts_at: "2026-08-22T16:00:00.000Z",
        ends_at: endsAt,
        expires_at: "2026-08-22T19:00:00.000Z",
      }),
    );

    expect(await findOverlapping(truckId, LUNCH_START, LUNCH_END)).toEqual([]);
  });

  it("treats back-to-back windows as not overlapping", async () => {
    // A location expiring exactly when the incoming one starts is adjacent, not in
    // conflict. Half-open on both sides (`lt`/`gt`) is what expresses that, and plan
    // decision #6 keeps `>` here while negations compare with `>=`.
    await insertLocation(
      aLocation({
        starts_at: "2026-08-22T06:00:00.000Z",
        ends_at: LUNCH_START,
        expires_at: LUNCH_START,
      }),
    );

    expect(await findOverlapping(truckId, LUNCH_START, LUNCH_END)).toEqual([]);
  });

  it("does not find another truck's location", async () => {
    const otherTruck = await seedTruck("Other Truck");
    await insertLocation(aLocation({ truck_id: otherTruck }));

    expect(await findOverlapping(truckId, LUNCH_START, LUNCH_END)).toEqual([]);
  });

  it("⚠ compares expires_at, not ends_at, when the two differ", async () => {
    // The mutation-proof row. This location's `ends_at` sits BEFORE the incoming window
    // while its `expires_at` extends INTO it — the shape produced by #5's
    // `posted_at + 8h` fallback. A predicate reading `ends_at` returns nothing here and
    // passes every other test in this block, so without this row the correction is
    // untested even though it looks covered.
    await insertLocation(
      aLocation({
        starts_at: "2026-08-22T06:00:00.000Z",
        ends_at: "2026-08-22T07:00:00.000Z",
        expires_at: "2026-08-22T10:00:00.000Z",
      }),
    );

    expect(await findOverlapping(truckId, LUNCH_START, LUNCH_END)).toHaveLength(1);
  });
});

describe("deleteLocations", () => {
  it("deletes the rows it is given and leaves the others", async () => {
    const doomed = await insertLocation(aLocation());
    const spared = await insertLocation(
      aLocation({
        starts_at: "2026-08-22T16:00:00.000Z",
        expires_at: "2026-08-22T19:00:00.000Z",
      }),
    );

    await deleteLocations([doomed.id]);

    const remaining = await findOverlapping(truckId, LUNCH_START, "2026-08-22T23:00:00.000Z");
    expect(remaining.map((row) => row.id)).toEqual([spared.id]);
  });

  it("deletes several at once, because a cancellation covers a window", async () => {
    const first = await insertLocation(aLocation());
    const second = await insertLocation(
      aLocation({
        starts_at: "2026-08-22T16:00:00.000Z",
        expires_at: "2026-08-22T19:00:00.000Z",
      }),
    );

    await deleteLocations([first.id, second.id]);

    expect(await findOverlapping(truckId, LUNCH_START, "2026-08-22T23:00:00.000Z")).toEqual([]);
  });

  it("is a safe no-op on an empty array", async () => {
    // An empty list is the ORDINARY case: a negation for a truck with nothing scheduled
    // is a silent no-op by design (#1), not an error.
    //
    // ⚠ THIS PINS THE OUTCOME, NOT THE MECHANISM, and deliberately so. An earlier
    // comment here claimed `.in("id", [])` is a PostgREST syntax error and that the
    // guard in `deleteLocations` is therefore a correctness requirement. Measured
    // against the real database: it returns 204 with no error, and the equivalent
    // select returns `[]`. The guard is an optimisation — one skipped round trip.
    //
    // So this row passes with or without it, which is correct: callers depend on "no
    // throw, nothing deleted" regardless of which layer provides it. It was deleting
    // the guard and seeing NOTHING fail that exposed the false claim.
    await insertLocation(aLocation());

    await expect(deleteLocations([])).resolves.toBeUndefined();

    // And it really was a no-op: the existing row is untouched.
    expect(await findOverlapping(truckId, LUNCH_START, LUNCH_END)).toHaveLength(1);
  });
});
