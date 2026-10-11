import { supabaseAdmin } from "@/lib/supabase";
import type { Truck } from "@/lib/types";

// DB access only — no business logic. Returns the truck row when an *active* truck
// has this id, or null when none does (unknown id, or is_active = false). The
// caller decides what null means. All reads use the service role (RLS bypassed
// server-side).
//
// Nothing calls this module since the teardown (Phase 4). It is kept on purpose: it
// matches the current schema, and Phase 5 rewrites it along with that schema.
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

// Denormalized last-known position: what the map falls back to when a truck has no
// live location — the grey marker still needs somewhere to sit. The columns are
// dropped in Phase 5's schema reset, and this function with them.
//
// It takes two `number`s rather than `number | null`, so there is no way to SPELL a
// call that clears a known position.
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
