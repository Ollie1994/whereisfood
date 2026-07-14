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
  return data as Truck | null;
}
