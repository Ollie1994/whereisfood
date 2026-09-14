import { supabaseAdmin } from "@/lib/supabase";

// DB access only — no business logic, no network. `geocoding.ts` one layer up owns
// the decision of WHEN to read or write; this owns only how.
//
// `geocoding_cache` is `address_raw` (primary key) → `latitude` / `longitude`, plus
// `cached_at`. Cached FOREVER, with no expiry column and no sweeper — see the write
// path below for what that forbids.

// What a cache row yields. Deliberately not the row type: `cached_at` is provenance
// for a human reading the table, and nothing in the geocoding path branches on it.
export interface CachedGeocode {
  latitude: number;
  longitude: number;
}

// ⚠ THE KEY IS CASE-FOLDED, AND BOTH SIDES MUST USE THIS ONE FUNCTION. `address_raw` is
// the primary key, so "Kungsgatan 12" and "kungsgatan 12" would otherwise be two
// permanent rows and two throttled Nominatim requests for one address — and the table
// has no expiry, so the duplicate is forever.
//
// ⚠ CASE ONLY. Whitespace is already normalised upstream: `extractAddressCandidate`
// rebuilds its result from the match groups with `.replace(/\s+/gu, " ").trim()`, so
// "Andra   Långgatan 12" never reaches here as anything but one clean string. Verified
// rather than assumed, and stated because folding whitespace here too would look
// harmless and would duplicate a rule that already has an owner.
//
// `toLowerCase()` rather than `toLocaleLowerCase("sv")`, matching `location.ts`'s call
// and its reasoning: Swedish has no casing rule that differs from the default for any
// letter in these addresses, and a locale-sensitive fold would make cache identity
// depend on the runtime's ICU data.
//
// ⚠ ASYMMETRY HERE IS THE EXPENSIVE FAILURE — fold on write but not on read and EVERY
// lookup misses, which presents as a cache that silently never works while Nominatim
// traffic quietly doubles. One function used by both sides is the structural defence.
//
// ⚠ AND IT IS NOT PINNED BY A UNIT TEST, because nothing in this repo unit-tests the db
// layer — `geocoding.test.ts` mocks this module out entirely, so it cannot see the key
// at all. Verified live against local Supabase instead: `putCachedGeocode("Testgatan
// 99", …)` followed by reads for `"Testgatan 99"`, `"testgatan 99"` and `"TESTGATAN 99"`
// all hit, `rowCount` is 1, and the stored key is `"testgatan 99"`.
//
// A manual verification is weaker than a test and this says so rather than implying
// otherwise. #72 owns the integration suite and should pin this round trip there; noted
// on that issue so the obligation is not carried only by this comment.
// Private on purpose. `geocoding.ts` deduplicates concurrent requests on the RAW
// address rather than importing this, because importing it would force that module's
// test mock to pull in `supabaseAdmin` at hoist time or re-implement the fold — and a
// fold duplicated in a mock is exactly the asymmetry warned about above. The cost is
// stated at that call site.
function cacheKey(addressRaw: string): string {
  return addressRaw.toLowerCase();
}

// A miss returns null rather than throwing. That is the ordinary case on first
// sight of an address, not an error — `maybeSingle()` is what expresses it, and a
// real DB fault still throws through to the caller.
export async function getCachedGeocode(addressRaw: string): Promise<CachedGeocode | null> {
  const { data, error } = await supabaseAdmin
    .from("geocoding_cache")
    .select("latitude, longitude")
    .eq("address_raw", cacheKey(addressRaw))
    .maybeSingle();

  if (error) throw error;
  return data;
}

// ⚠ ONLY EVER CALLED WITH A SUCCESSFUL, IN-BOX RESULT. The table has no expiry
// column, no TTL and nothing that sweeps it, so a row written here is permanent —
// which makes caching a failure a permanent failure for that address. Plan decision
// #2 states it as a rule: *"never cache negative results"*. This function cannot
// enforce that (it is handed coordinates, and a `0,0` from a bad parse looks like a
// coordinate), so the guarantee lives in `geocoding.ts`, which validates through
// `isInGothenburg` before reaching this line. Said here so the invariant is visible
// at the write itself rather than only at the caller.
//
// `upsert` rather than `insert`, and the reason is a race rather than tidiness: two
// concurrent lambdas can miss the same address and both geocode it, and the second
// insert would raise 23505. Nominatim is deterministic for a given query, so the
// second write carries the same coordinates — making the conflict genuinely benign
// and an overwrite the correct resolution. An `insert` would need the same 23505
// swallow `persistPost` already carries, for no gain.
export async function putCachedGeocode(
  addressRaw: string,
  latitude: number,
  longitude: number,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("geocoding_cache")
    .upsert(
      { address_raw: cacheKey(addressRaw), latitude, longitude },
      { onConflict: "address_raw" },
    );

  if (error) throw error;
}
