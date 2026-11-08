import { assertAllRows } from "@/lib/db/complete";
import { supabaseAdmin } from "@/lib/supabase";
import type { Truck } from "@/lib/types";

// DB access only — no business logic. Reads use the service role (RLS bypassed
// server-side); errors propagate unchanged. An id that isn't a uuid raises `22P02`, not
// null (probed 2026-10-19 on `getActiveTruckById`). Callers must check the shape first;
// `isUuid` (`src/lib/validators/uuid.ts`) exists for it.

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

// The trucks, all or only the active ones, ordered by name in Swedish order (Å, Ä, Ö after
// Z): `trucks.name` is declared with the `sv-SE-x-icu` collation (Phase 5 plan, #19). Then
// by `id`: names aren't unique, and two trucks of one name would otherwise come back in any
// order (`db-trucks.test.ts`, "breaks a name tie"). Throws rather than return part of the
// trucks past `max_rows` (`assertAllRows`). One query for both lists, so a fix to one
// reaches the other.
async function listTrucksWhere(fn: string, activeOnly: boolean): Promise<Truck[]> {
  let query = supabaseAdmin.from("trucks").select(TRUCK_COLUMNS, { count: "exact" });
  if (activeOnly) query = query.eq("is_active", true);
  const { data, error, count } = await query.order("name").order("id");

  if (error) throw error;
  assertAllRows(fn, data, count);
  return data;
}

// Every active truck: the public map's.
export async function listActiveTrucks(): Promise<Truck[]> {
  return listTrucksWhere("listActiveTrucks", true);
}

// Every truck, inactive ones included: the admin's list (Phase 7 plan, "Functions and
// types").
export async function listAllTrucks(): Promise<Truck[]> {
  return listTrucksWhere("listAllTrucks", false);
}
