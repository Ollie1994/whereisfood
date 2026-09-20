import { supabaseAdmin } from "@/lib/supabase";
import type { Truck } from "@/lib/types";

// DB access only — no business logic. Returns the truck row when an *active* truck
// has this id, or null when none does (unknown id, or is_active = false). The
// caller decides what null means: the ingestion service maps it to a 400 for an
// unknown/inactive truck. All reads use the service role (RLS bypassed server-side).
export async function getActiveTruckById(id: string): Promise<Truck | null> {
  const { data, error } = await supabaseAdmin
    .from("trucks")
    .select("*")
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  // No cast: with the client parameterized by the generated Database types, the
  // trucks Row type IS Truck (issue #48).
  return data;
}

// Denormalized last-known position, updated ONLY after a location row is
// successfully inserted (#68). It is what the map falls back to when a truck has no
// live location — the grey marker still needs somewhere to sit.
//
// ⚠ THERE IS NO PATH THAT NULLS THESE, AND THAT IS THE POINT. A failed geocode must
// leave the previous position intact rather than clearing it: "we could not resolve
// today's caption" is not "we no longer know where this truck has ever been", and
// treating it as such would erase a working grey marker every time Nominatim had a
// bad minute. The service enforces this by only calling here on success; this
// signature makes it structural by taking two `number`s rather than `number | null`,
// so there is no way to SPELL the clearing call.
export async function updateLastKnownPosition(
  truckId: string,
  latitude: number,
  longitude: number,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("trucks")
    .update({ last_known_latitude: latitude, last_known_longitude: longitude })
    .eq("id", truckId);

  if (error) throw error;
}
