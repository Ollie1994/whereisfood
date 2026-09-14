import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCachedGeocode, putCachedGeocode } from "@/lib/db/geocoding";
import { GOTHENBURG_BBOX } from "@/lib/geo";

vi.mock("@/lib/db/geocoding", () => ({
  getCachedGeocode: vi.fn(),
  putCachedGeocode: vi.fn(),
}));

const getCached = vi.mocked(getCachedGeocode);
const putCached = vi.mocked(putCachedGeocode);

// Järntorget, inside the box. Reused so a row's intent reads as "in box" or "out of
// box" rather than a coordinate the reader has to check against `geo.ts` themselves.
const IN_BOX = { lat: "57.6998935", lon: "11.952503" };
// Stockholm — the exact failure the box exists to catch, and the one `bounded=1`
// appears to prevent.
const OUT_OF_BOX = { lat: "59.3293", lon: "18.0686" };

const THROTTLE_MS = 1100;

function nominatimOk(hits: unknown[]) {
  return { ok: true, json: async () => hits } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;
let geocode: typeof import("@/lib/geocoding").geocode;

// ⚠ THE MODULE IS RE-IMPORTED PER TEST, and this is not ceremony. `geocoding.ts` holds
// the throttle as MODULE-LEVEL STATE — a promise chain that grows by one 1100 ms link
// per call — and that state outlives a test.
//
// A first version of this file imported it once at the top and asserted, in a comment,
// that "the gate is empty on the first call in a process". That was false and the
// suite proved it: fourteen tests each appended a link, every test after the first
// waited its turn, and the file took 13.3 s where the entire unit suite takes 2 s. The
// last test then saw ZERO fetches because it was still queued behind all of them.
//
// `vi.resetModules()` gives each test a fresh module with an empty gate, so the call
// under test passes through immediately and the file runs in milliseconds. The
// throttle's actual behaviour is asserted in its own block, with fake timers, where
// the queueing is the thing under test rather than a tax on everything else.
beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();

  getCached.mockResolvedValue(null);
  putCached.mockResolvedValue(undefined);

  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NOMINATIM_BASE_URL", "https://nominatim.example.test");

  ({ geocode } = await import("@/lib/geocoding"));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("a cache hit", () => {
  it("returns coordinates with ZERO network calls", async () => {
    // The acceptance criterion that shapes the module's order: the cache lookup comes
    // before the throttle, so a hit never waits behind another caller's gate.
    getCached.mockResolvedValue({ latitude: 57.7, longitude: 11.97 });

    await expect(geocode("Kungsgatan 12")).resolves.toEqual({
      lat: 57.7,
      lng: 11.97,
      displayName: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(putCached).not.toHaveBeenCalled();
  });

  it("returns displayName null, which is a SCHEMA limit and not a choice (#103)", async () => {
    // ⚠ PINS A KNOWN INCONSISTENCY. `geocoding_cache` has no display-name column —
    // verified against the generated types — so the same address yields Nominatim's
    // canonical string on the request that first geocodes it and `null` on every later
    // one. `locations.address_geocoded` therefore ends up populated for reasons
    // unrelated to the caption. Tracked as #103; not load-bearing, since the pin comes
    // from the coordinates.
    getCached.mockResolvedValue({ latitude: 57.7, longitude: 11.97 });
    const cachedHit = await geocode("Kungsgatan 12");

    getCached.mockResolvedValue(null);
    fetchMock.mockResolvedValue(
      nominatimOk([{ ...IN_BOX, display_name: "Kungsgatan 12, Göteborg" }]),
    );
    const freshHit = await geocode("Kungsgatan 12");

    expect(cachedHit?.displayName).toBeNull();
    expect(freshHit?.displayName).toBe("Kungsgatan 12, Göteborg");
  });
});

describe("a successful miss", () => {
  it("returns coordinates as NUMBERS, not the strings Nominatim sends", async () => {
    // ⚠ THE FAILURE `geo.ts` WARNS ABOUT AT LENGTH. Nominatim sends `lat`/`lon` as JSON
    // strings and `res.json()` is `any`, so `isInGothenburg(hit.lat, hit.lon)`
    // type-checks and relational coercion makes `"57.69" >= 57.5` true — a string
    // coordinate waved through into `locations.latitude`. The conversion is explicit in
    // the module and the box check is the backstop, so this asserts the TYPE and not
    // only the value.
    fetchMock.mockResolvedValue(nominatimOk([{ ...IN_BOX, display_name: "Järntorget" }]));

    const result = await geocode("Järntorget");

    expect(typeof result?.lat).toBe("number");
    expect(typeof result?.lng).toBe("number");
    expect(result).toEqual({ lat: 57.6998935, lng: 11.952503, displayName: "Järntorget" });
  });

  it("writes exactly one cache row", async () => {
    fetchMock.mockResolvedValue(nominatimOk([IN_BOX]));

    await geocode("Andra Långgatan 12");

    expect(putCached).toHaveBeenCalledTimes(1);
    expect(putCached).toHaveBeenCalledWith("Andra Långgatan 12", 57.6998935, 11.952503);
  });

  it("sends an identifying User-Agent and bounds the query", async () => {
    fetchMock.mockResolvedValue(nominatimOk([IN_BOX]));

    await geocode("Järntorget");

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const headers = init.headers as Record<string, string>;
    // The usage policy asks for identification AND a contact address, so both halves
    // are asserted rather than just the presence of a header.
    expect(headers["User-Agent"]).toMatch(/whereisfood/);
    expect(headers["User-Agent"]).toContain("github.com");
    expect(url.searchParams.get("countrycodes")).toBe("se");
    expect(url.searchParams.get("bounded")).toBe("1");
  });

  it("derives the viewbox from GOTHENBURG_BBOX rather than a literal", async () => {
    // ⚠ THIS PINS THE DERIVATION, NOT AN ORDERING. An earlier version claimed Nominatim
    // "wants west,north,east,south" and that our declaration order was a transposition
    // hazard. The docs say otherwise, verbatim: *"Any two corner points of the box are
    // accepted as long as they make a proper box."* Both orders describe the same box,
    // so there was never a wrong one (PR #104 review).
    //
    // What is still worth pinning is that the string comes from the constant: asserted
    // against `GOTHENBURG_BBOX` itself, so moving the box moves this test with it and a
    // stale hand-typed copy would fail.
    fetchMock.mockResolvedValue(nominatimOk([IN_BOX]));

    await geocode("Järntorget");

    const [url] = fetchMock.mock.calls[0] as [URL];
    const { west, south, east, north } = GOTHENBURG_BBOX;
    expect(url.searchParams.get("viewbox")).toBe(`${west},${south},${east},${north}`);
  });

  it("preserves a path prefix on the base URL", async () => {
    // ⚠ `"/search"` IS ROOT-ABSOLUTE AND DISCARDS THE PREFIX:
    // `new URL("/search", "https://geo.internal/nominatim")` is
    // `https://geo.internal/search`, verified. The public instance has no prefix, so a
    // first version was invisibly wrong — a self-hosted Nominatim behind one would 404
    // every request and geocode nothing, permanently, with nothing in the logs
    // (PR #104 review).
    vi.stubEnv("NOMINATIM_BASE_URL", "https://geo.internal.test/nominatim");
    vi.resetModules();
    ({ geocode } = await import("@/lib/geocoding"));
    fetchMock.mockResolvedValue(nominatimOk([IN_BOX]));

    await geocode("Järntorget");

    const [url] = fetchMock.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/nominatim/search");
  });

  it("does not double the slash when the base already ends in one", async () => {
    vi.stubEnv("NOMINATIM_BASE_URL", "https://geo.internal.test/nominatim/");
    vi.resetModules();
    ({ geocode } = await import("@/lib/geocoding"));
    fetchMock.mockResolvedValue(nominatimOk([IN_BOX]));

    await geocode("Järntorget");

    const [url] = fetchMock.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/nominatim/search");
  });
});

describe("every failure returns null and caches NOTHING", () => {
  // ⚠ THE SHARED ASSERTION IS `putCached` NOT BEING CALLED, and it is the point of the
  // block rather than a detail of it. `geocoding_cache` has no expiry, no TTL and
  // nothing that sweeps it, so a cached failure is PERMANENT for that address — plan
  // decision #2 states it as a rule. The module makes it structural by writing only
  // after the box check; this is what stops a later edit moving the write earlier.
  it.each([
    [
      "a result outside the Gothenburg box — bounded=1 is a hint, not a guarantee",
      () => fetchMock.mockResolvedValue(nominatimOk([OUT_OF_BOX])),
    ],
    ["no hits at all", () => fetchMock.mockResolvedValue(nominatimOk([]))],
    [
      "a non-2xx response",
      () => fetchMock.mockResolvedValue({ ok: false, json: async () => [] } as unknown as Response),
    ],
    [
      "a timeout",
      () =>
        fetchMock.mockRejectedValue(
          Object.assign(new Error("timed out"), { name: "TimeoutError" }),
        ),
    ],
    ["a network error", () => fetchMock.mockRejectedValue(new TypeError("fetch failed"))],
    [
      "a body that is not an array",
      () => fetchMock.mockResolvedValue(nominatimOk({} as unknown as unknown[])),
    ],
    [
      "coordinates that are not numbers",
      () => fetchMock.mockResolvedValue(nominatimOk([{ lat: null, lon: undefined }])),
    ],
  ])("%s", async (_label, arrange) => {
    arrange();

    await expect(geocode("Någonstans 1")).resolves.toBeNull();
    expect(putCached).not.toHaveBeenCalled();
  });

  it("does not retry — one failure is one request", async () => {
    // Plan decision #2: the post is stored and re-parseable, and retrying in-request
    // multiplies load against an endpoint that may already be throttling us.
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    await geocode("Någonstans 1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["missing", ""],
    ["malformed — no scheme", "nominatim.example.test"],
    ["malformed — not a URL at all", "://///"],
  ])("treats a %s base URL as a miss rather than a throw", async (_label, value) => {
    // ⚠ THE MALFORMED ROWS ARE THE ONES THAT MATTER. `new URL("/search", "no-scheme")`
    // throws `TypeError: Invalid URL`, and a first version built the URL OUTSIDE the
    // try block — so a misconfigured env var escaped `geocode()` as a rejection. This
    // module runs inside `after()`, where that loses the post, and the empty-string
    // guard covers only the easy half of the same class (PR #104 review).
    vi.stubEnv("NOMINATIM_BASE_URL", value);
    vi.resetModules();
    ({ geocode } = await import("@/lib/geocoding"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(geocode("Järntorget")).resolves.toBeNull();

    // ⚠ EVERY ROW WARNS, AND AN EARLIER VERSION OF THIS COMMENT SAID ONLY ONE COULD.
    // It claimed a malformed URL "cannot [be distinguished] from a network failure
    // without replicating `new URL`'s parsing". `URL.canParse` does exactly that and
    // has since Node 18.17; this runs on Node 22. An impossibility asserted without
    // checking — the same move as the viewbox "transposition hazard" r1 deleted.
    //
    // It mattered: with the check absent, a malformed base produced null with ZERO
    // fetches and ZERO warnings, permanently. Verified before the fix (PR #104 r3).
    expect(warn).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("the cache is an optimisation, not a dependency", () => {
  // ⚠ THIS BLOCK'S NAME USED TO OVER-CLAIM. It covered only the WRITE, while the READ
  // was unguarded and rejected straight out of `geocode()` — so the block asserted a
  // general property and tested half of it (PR #104 r2). Both halves are here now, and
  // the read case is the one that was actually broken.
  it("returns the geocode even when the cache READ fails", async () => {
    // A DB fault on the read must not skip a Nominatim call that would have succeeded,
    // and must not break the module's contract that `null` covers every failure.
    getCached.mockRejectedValue(new Error("connection terminated"));
    fetchMock.mockResolvedValue(nominatimOk([IN_BOX]));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(geocode("Järntorget")).resolves.toEqual({
      lat: 57.6998935,
      lng: 11.952503,
      displayName: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns the geocode even when the cache write fails", async () => {
    // ⚠ A FAILED WRITE MUST NOT DISCARD A GOOD ANSWER. The coordinates are already
    // fetched and already box-validated at that point, so letting a transient Postgres
    // error propagate trades a slow next lookup for a LOST PIN. The next miss simply
    // geocodes again.
    fetchMock.mockResolvedValue(nominatimOk([IN_BOX]));
    putCached.mockRejectedValue(new Error("connection terminated"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(geocode("Järntorget")).resolves.toEqual({
      lat: 57.6998935,
      lng: 11.952503,
      displayName: null,
    });
    // Logged rather than swallowed silently: a cache that never writes looks exactly
    // like a cache that is never hit, and the only visible symptom would be Nominatim
    // traffic that should not exist.
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("being throttled is distinguishable from finding nothing", () => {
  it.each([429, 403])("logs a warning on %d", async (status) => {
    // ⚠ COLLAPSING THESE INTO A SILENT NULL IS HOW THIS PATH GOES DARK. Plan decision
    // #2 states the risk outright — Vercel egresses from a shared IP pool, so another
    // tenant's traffic can get us rate-limited regardless of our own behaviour. Without
    // the log, the symptom is a steady trickle of `parsing_status = 'failed'` that
    // reads as bad caption quality.
    fetchMock.mockResolvedValue({ ok: false, status, json: async () => [] } as unknown as Response);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(geocode("Järntorget")).resolves.toBeNull();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining(String(status)));
    warn.mockRestore();
  });

  it("stays quiet on an ordinary bad day", async () => {
    // A 404 or a 500 is not "stop, or you are already stopped". Logging those too would
    // make the warning meaningless, which is the same reason an ordinary miss is not
    // logged at all.
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => [] } as unknown as Response);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(geocode("Järntorget")).resolves.toBeNull();

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("the throttle", () => {
  it("serialises concurrent callers rather than letting them fire together", async () => {
    // ⚠ THE MECHANISM UNDER TEST IS THE QUEUE, NOT THE DELAY. A timestamp comparison
    // ("has 1100 ms passed since the last call?") is the obvious implementation and is
    // wrong under concurrency: two callers arriving together both observe the same
    // stale timestamp and both fire. A promise chain makes the second wait for the
    // first.
    //
    // Fake timers here and nowhere else. Every other test gets a fresh module with an
    // empty gate, so it never waits; this one needs the wait to be observable without
    // spending 1100 ms of wall clock on it.
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(nominatimOk([IN_BOX]));

    const first = geocode("A");
    const second = geocode("B");

    // Let both reach their await points without advancing the clock. The first passes
    // the empty gate; the second is queued behind it.
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Only after a full interval does the second become eligible.
    await vi.advanceTimersByTimeAsync(THROTTLE_MS);
    await Promise.all([first, second]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("collapses concurrent misses on the SAME address to one request", async () => {
    // ⚠ THE THUNDERING HERD THE QUEUE CREATES. All callers read the cache before any
    // row exists, then resume one by one — three concurrent calls for one address
    // produced THREE Nominatim requests and three upserts, spending the budget this
    // module exists to protect (PR #104 r2).
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(nominatimOk([IN_BOX]));

    const all = [geocode("Samma gatan 1"), geocode("Samma gatan 1"), geocode("Samma gatan 1")];
    await vi.advanceTimersByTimeAsync(THROTTLE_MS * 4);
    await Promise.all(all);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(putCached).toHaveBeenCalledTimes(1);
  });

  it("collapses them even when the leader is SLOWER than the throttle interval", async () => {
    // ⚠ THE CONDITION r2's FIX QUIETLY DEPENDED ON. That fix re-checked the cache after
    // the wait and its comment asserted, as an invariant, that "the caller ahead has
    // finished by the time we resume". Its gate is scheduled from when it ENTERED the
    // throttle, and `TIMEOUT_MS` is 3000 against a 1100 ms gate — so a leader slower
    // than one interval has not written its row yet. Verified: a 1500 ms fetch gave
    // 2 requests and 2 writes for one address (PR #104 r3).
    //
    // The existing row above could never catch it, because `fetchMock` resolves in a
    // microtask — a test structurally blind to the case it was named for, which is the
    // second time in this PR (see the different-addresses herd test).
    //
    // Deduplicating BEFORE the throttle removes the dependency entirely: joiners share
    // the leader's promise and never consult the clock.
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve(nominatimOk([IN_BOX])), THROTTLE_MS + 400),
        ),
    );

    const all = [geocode("Långsam gatan 1"), geocode("Långsam gatan 1"), geocode("Långsam gatan 1")];
    await vi.advanceTimersByTimeAsync(20_000);
    await Promise.all(all);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(putCached).toHaveBeenCalledTimes(1);
  });

  it("does NOT deduplicate concurrent callers across casings — a stated limit", async () => {
    // ⚠ PINS A BOUND, NOT A BUG. The in-flight map keys on the RAW address, so two
    // concurrent callers differing only in case make two requests. The cost is bounded:
    // they share a cache ROW, so the second write is an upsert of identical coordinates
    // rather than a duplicate row, and every later call hits the cache for both casings.
    //
    // The alternative was importing the db layer's `cacheKey`, which forces this file's
    // `vi.mock` factory to pull in `supabaseAdmin` at hoist time or re-implement the
    // fold — and a fold duplicated in a mock is drift this PR has already been caught by
    // twice (PR #104 r3).
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(nominatimOk([IN_BOX]));

    const all = [geocode("Kungsgatan 12"), geocode("kungsgatan 12")];
    await vi.advanceTimersByTimeAsync(THROTTLE_MS * 4);
    await Promise.all(all);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Both writes carry the same coordinates and the db layer folds the key, so this is
    // one row written twice rather than two rows.
    expect(putCached.mock.calls.map((c) => [c[1], c[2]])).toEqual([
      [57.6998935, 11.952503],
      [57.6998935, 11.952503],
    ]);
  });

  it("releases the in-flight entry so a later call is not served a stale promise", async () => {
    // The map must hold only genuinely in-flight work. A leaked entry would pin one
    // address's answer for the life of the instance — including a `null` from a
    // transient failure, which is the permanent-negative-cache hazard the write path is
    // structured to avoid, reintroduced in memory.
    fetchMock.mockResolvedValue(nominatimOk([IN_BOX]));

    await geocode("Ett ställe 1");
    await geocode("Ett ställe 1");

    // Two sequential calls: the second is a fresh request, not the first's promise.
    // (`getCached` stays mocked to null here, so the cache cannot be what serves it.)
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("⚠ queues UNBOUNDEDLY — the Nth concurrent caller waits N intervals", async () => {
    // PINS A HAZARD, NOT A FEATURE. Each call appends a link, so five concurrent misses
    // in one instance mean the fifth fires ~4.4 s after the first. With a 3 s fetch
    // timeout and a ~10 s lambda budget, a burst of ten in a single instance would see
    // the later ones exceed the invocation before they are sent.
    //
    // Accepted rather than fixed: plan decision #2 puts ~150 posts/day behind a
    // dictionary-first path, so concurrent MISSES in one instance are rare, and the
    // failure mode is a null geocode — which this module's caller already handles as
    // `parsing_status = 'failed'`, re-parseable. Recorded so it is a known bound rather
    // than a surprise if volume grows.
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(nominatimOk([IN_BOX]));

    const calls = [geocode("A"), geocode("B"), geocode("C")];

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(THROTTLE_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(THROTTLE_MS);
    await Promise.all(calls);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
