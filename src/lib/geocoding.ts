import { getCachedGeocode, putCachedGeocode } from "@/lib/db/geocoding";
import { GOTHENBURG_BBOX, isInGothenburg } from "@/lib/geo";

// The fallback path for addresses the dictionary does not know — cache first, then
// Nominatim. Reached ONLY when `extractLocation` missed and `extractAddressCandidate`
// found an address, which is what keeps it off the hot path.
//
// ⚠ DELIBERATELY NOT LOAD-BEARING, and the whole design rests on that. A dictionary
// hit carries reviewed coordinates and never arrives here; a failure here degrades to
// `parsing_status = 'failed'` with a re-parse path (#7), not to a broken system. Plan
// decision #2 reaches that conclusion the long way round: a distributed limiter cannot
// deliver the guarantee it appears to, so the correct response is not a better limiter
// but never depending on this succeeding.

// Nominatim's usage policy caps automated clients at 1 request/second and requires an
// identifying User-Agent carrying a contact address.
//
// The string mirrors `scripts/seed-dictionary.mjs`, which honours the same policy for
// the one-off seeding run. Two different clients SHOULD identify differently — that is
// what a User-Agent is for — so these are intentionally distinct rather than shared.
const CONTACT = "https://github.com/Ollie1994/whereisfood";
const USER_AGENT = `whereisfood/1.0 (${CONTACT})`;

// > 1s, with headroom for timer granularity — the same margin the seeding script uses.
const THROTTLE_MS = 1100;

// ~3s, per plan decision #2. Not generous: a blocked or slow Nominatim must not hold a
// lambda open, and the caller's fallback (no location row, `'failed'`, re-parseable)
// is cheap. The seeding script uses 10s because a developer waiting at a terminal is a
// different trade from a request holding a serverless invocation.
const TIMEOUT_MS = 3000;

// ⚠ DERIVED FROM `GOTHENBURG_BBOX`, NOT COPIED. Nominatim wants
// `west,north,east,south`, which is a different order from our own box — exactly the
// kind of transposition that produces a plausible-looking wrong answer. One definition
// with two consumers is the plan's M6 rule; `seed-dictionary.mjs` copies these numbers
// instead, and states why it is allowed to (it is `.mjs`, and `dictionary.test.ts`
// re-validates every committed entry with the real `isInGothenburg`, so drift there
// costs a re-run rather than a bad pin). No such backstop exists here, so no copy.
const VIEWBOX = [
  GOTHENBURG_BBOX.west,
  GOTHENBURG_BBOX.north,
  GOTHENBURG_BBOX.east,
  GOTHENBURG_BBOX.south,
].join(",");

// What the caller gets. `displayName` is Nominatim's canonical `display_name`, which
// the locations service (#68) stores as `address_geocoded`.
//
// ⚠ IT IS `null` ON A CACHE HIT, AND THAT IS A SCHEMA LIMIT RATHER THAN A CHOICE.
// `geocoding_cache` has three columns — `address_raw`, `latitude`, `longitude` —
// and no display name, verified against the generated types. So the same address
// yields a canonical string on the request that first geocodes it and `null` on every
// later one, which means `locations.address_geocoded` is populated inconsistently for
// reasons that have nothing to do with the caption. Filed as #103; not fixed here
// because it needs a migration and #63 is not the issue that owns one.
//
// Not load-bearing either way: the pin comes from `latitude`/`longitude`, and
// `address_geocoded` is display and debugging data.
export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string | null;
}

// The in-process throttle gate. A promise chain rather than a timestamp comparison, so
// concurrent callers queue behind one another instead of all observing the same "last
// call was long ago" and firing together.
let throttleGate: Promise<void> = Promise.resolve();

// ⚠ PER-INSTANCE, AND THE COMMENT IS THE POINT RATHER THAN THE MECHANISM. Vercel runs
// concurrent lambdas, so this bounds one instance and nothing more. Plan decision #2
// accepts that explicitly and the issue asks for it to be documented rather than
// overstated: Vercel also egresses from a SHARED IP POOL, so there is no dedicated IP
// a global limiter could protect — another tenant's traffic can get that IP throttled
// regardless of how well-behaved we are.
//
// So a distributed limiter would buy a guarantee it cannot actually deliver, and the
// real defence is upstream: dictionary hits never reach this module at all.
//
// ⚠ THE QUEUE IS UNBOUNDED, and that is a known bound rather than an oversight. Each
// call appends a link, so the Nth concurrent caller in one instance waits N intervals:
// five concurrent misses mean the fifth fires ~4.4 s after the first, and with a 3 s
// fetch timeout and a ~10 s lambda budget a burst of ten would see the later ones
// exceed the invocation before they are sent.
//
// Accepted, because the failure mode is a null geocode — which the caller already
// handles as `parsing_status = 'failed'`, re-parseable — and because decision #2 puts
// ~150 posts/day behind a dictionary-first path, so concurrent MISSES inside a single
// instance are rare. Pinned by test so it is a measured bound rather than an
// assumption, and so a volume change makes it visible instead of mysterious.
//
// ⚠ IT IS ALSO MODULE STATE THAT OUTLIVES A REQUEST. `geocoding.test.ts` re-imports
// the module per test for exactly this reason: a first version of that file shared one
// gate across fourteen tests and took 13.3 s where the whole unit suite takes 2 s.
function throttle(): Promise<void> {
  const waited = throttleGate;
  throttleGate = waited.then(() => new Promise((resolve) => setTimeout(resolve, THROTTLE_MS)));
  return waited;
}

// One Nominatim hit, as far as we trust it: every field arrives as `unknown` because
// `res.json()` is `any` and the response is a third party's.
interface NominatimHit {
  lat?: unknown;
  lon?: unknown;
  display_name?: unknown;
}

// ⚠ NOMINATIM RETURNS `lat` AND `lon` AS JSON **STRINGS**, which `geo.ts` already
// warns about at length — its `Number.isFinite` guard exists specifically because
// `isInGothenburg(hit.lat, hit.lon)` type-checks while relational coercion makes
// `"57.6997" >= 57.5` true, waving a string coordinate through into
// `locations.latitude`.
//
// This converts explicitly so that guard is a backstop rather than the only defence.
// `Number("")` is 0 and `Number(null)` is 0 — both inside no box by accident, but both
// finite — so the conversion is followed by the box check, not trusted alone.
function toCoordinate(value: unknown): number {
  return typeof value === "string" || typeof value === "number" ? Number(value) : Number.NaN;
}

// Coordinates for a free-text address, or `null`.
//
// `null` means "no usable answer" and covers every failure uniformly: a miss, a
// timeout, a network error, a non-2xx, an unparseable body, and a hit that lands
// outside Gothenburg. The caller does the same thing with all of them — no locations
// row, `parsing_status = 'failed'` — so distinguishing them here would be detail
// nothing consumes.
//
// ⚠ NO RETRY, per plan decision #2. The post is already stored and re-parseable, and
// retrying in-request multiplies load against an endpoint that may already be
// throttling us.
export async function geocode(address: string): Promise<GeocodeResult | null> {
  const cached = await getCachedGeocode(address);
  if (cached !== null) {
    // No NOMINATIM request on a hit, and the cache lookup precedes the throttle so a
    // hit never waits behind another caller's gate either.
    //
    // ⚠ "ZERO NETWORK CALLS" IS HOW #63 STATES THIS AND IT IS NOT LITERALLY TRUE — the
    // cache read is itself an HTTP request to Supabase. That distinction is not
    // pedantry: the one-off verification for this issue counted `fetch` calls and
    // reported 1 on a cache hit, which looked like the cache failing and was the
    // PostgREST request. The claim that matters is about the third-party service under
    // a usage policy, so it is stated that way here and the unit test asserts it with
    // the db layer mocked out, where the only possible caller of `fetch` is this
    // module.
    return { lat: cached.latitude, lng: cached.longitude, displayName: null };
  }

  const baseUrl = process.env.NOMINATIM_BASE_URL;
  // Absent config is a miss, not a throw. This runs inside `after()`, where a throw
  // becomes an unhandled rejection that loses the post — the same reasoning `date.ts`
  // and `time.ts` both carry for their own guards.
  if (!baseUrl) return null;

  await throttle();

  const hit = await fetchFirstHit(baseUrl, address);
  if (hit === null) return null;

  const lat = toCoordinate(hit.lat);
  const lng = toCoordinate(hit.lon);

  // ⚠ `bounded=1` IS A REQUEST PARAMETER, NOT A GUARANTEE — plan decision #3, and the
  // reason the box is checked again on the way back. A result outside it is treated as
  // a miss rather than a coarse answer: the alternative is a confident pin in the
  // wrong city, which is the failure `isInGothenburg` exists to stop.
  if (!isInGothenburg(lat, lng)) return null;

  // ⚠ WRITTEN ONLY HERE, AFTER THE BOX CHECK. Every failure path above returns before
  // reaching this line, which is what makes "never cache a negative result" structural
  // rather than remembered. The table has no expiry, so a cached failure is permanent.
  await putCachedGeocode(address, lat, lng);

  return {
    lat,
    lng,
    displayName: typeof hit.display_name === "string" ? hit.display_name : null,
  };
}

// The network half, separated so `geocode` reads as the decision sequence it is.
// Returns the first hit, or `null` for every kind of failure.
async function fetchFirstHit(baseUrl: string, address: string): Promise<NominatimHit | null> {
  const url = new URL("/search", baseUrl);
  url.searchParams.set("q", address);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  // Bound the search to Sweden and to Gothenburg. A hint, not a promise — see the
  // re-validation at the call site.
  url.searchParams.set("countrycodes", "se");
  url.searchParams.set("viewbox", VIEWBOX);
  url.searchParams.set("bounded", "1");

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "sv" },
      // `AbortSignal.timeout` rejects with a `TimeoutError`, caught below alongside
      // every other network failure — they are the same outcome to the caller.
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) return null;

    const body: unknown = await response.json();
    // `jsonv2` returns an array. An empty one is the ordinary "no such address"
    // answer, not an error.
    if (!Array.isArray(body) || body.length === 0) return null;

    return body[0] as NominatimHit;
  } catch {
    // Deliberately swallowed and deliberately not logged at error level: a failed
    // geocode is an expected outcome of a fallback path, and the caller records it as
    // `parsing_status = 'failed'`, which is the durable signal. Logging every miss
    // here would make an ordinary degradation look like an incident.
    return null;
  }
}
