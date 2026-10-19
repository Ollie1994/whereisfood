import { supabaseAdmin } from "@/lib/supabase";
import type { Truck } from "@/lib/types";

// DB access only — no business logic. Reads use the service role (RLS bypassed
// server-side); errors propagate unchanged.

// Every column of `trucks`, named. ONE STRING LITERAL: supabase-js infers the row type
// from the literal text, and with rows returned uncast `tsc` then fails if a column of
// `Truck` is missing (Phase 5 plan, "Functions and types"; issue #48). An extra column
// isn't a type error; `db-trucks.test.ts`'s key-set test catches that side.
const TRUCK_COLUMNS = "id, name, instagram_handle, cuisine_type, description, is_active, created_at";

// The truck when an *active* truck has this id; null for an unknown id or an inactive
// truck. The caller decides what null means.
export async function getActiveTruckById(id: string): Promise<Truck | null> {
  const { data, error } = await supabaseAdmin
    .from("trucks")
    .select(TRUCK_COLUMNS)
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// Every active truck, ordered by name.
export async function listActiveTrucks(): Promise<Truck[]> {
  const { data, error } = await supabaseAdmin
    .from("trucks")
    .select(TRUCK_COLUMNS)
    .eq("is_active", true)
    .order("name");

  if (error) throw error;
  return data;
}
