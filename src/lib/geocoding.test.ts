import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCachedGeocode, putCachedGeocode } from "@/lib/db/geocoding";

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

  it("orders the viewbox west,north,east,south — Nominatim's order, not ours", async () => {
    // ⚠ THE TRANSPOSITION THIS PINS produces a plausible wrong answer rather than an
    // error, which is why it is worth a test of its own. `GOTHENBURG_BBOX` is declared
    // west/south/east/north and Nominatim wants west,north,east,south — the two middle
    // values swap. The module derives the string from the constant rather than copying
    // it, so widening the box cannot silently reorder it.
    fetchMock.mockResolvedValue(nominatimOk([IN_BOX]));

    await geocode("Järntorget");

    const [url] = fetchMock.mock.calls[0] as [URL];
    expect(url.searchParams.get("viewbox")).toBe("11.6,57.85,12.2,57.5");
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

  it("treats missing config as a miss rather than a throw", async () => {
    // This runs inside `after()`, where a throw becomes an unhandled rejection that
    // loses the post — the same reasoning `date.ts` and `time.ts` carry for their own
    // guards.
    vi.stubEnv("NOMINATIM_BASE_URL", "");
    vi.resetModules();
    ({ geocode } = await import("@/lib/geocoding"));

    await expect(geocode("Järntorget")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
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
