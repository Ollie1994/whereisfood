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

// A miss returns null rather than throwing. That is the ordinary case on first
// sight of an address, not an error — `maybeSingle()` is what expresses it, and a
// real DB fault still throws through to the caller.
export async function getCachedGeocode(addressRaw: string): Promise<CachedGeocode | null> {
  const { data, error } = await supabaseAdmin
    .from("geocoding_cache")
    .select("latitude, longitude")
    .eq("address_raw", addressRaw)
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
    .upsert({ address_raw: addressRaw, latitude, longitude }, { onConflict: "address_raw" });

  if (error) throw error;
}
