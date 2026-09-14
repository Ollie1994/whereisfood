import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";

// Minimal fixtures for the integration project. Deliberately small — #72 EXTENDS this
// file rather than replacing it, so what lands here is only what #64 needs.
//
// Safe to import `supabaseAdmin` at module scope because `setup.ts` runs first and has
// already populated `process.env` and refused any non-local database.

// ⚠ ORDER MATTERS: `locations` and `posts` both reference `trucks`, so trucks must go
// last or the delete violates a foreign key. Written as a list so the dependency is
// visible rather than implied by three consecutive statements.
const TABLES_CHILD_FIRST = ["locations", "posts", "trucks"] as const;

// ⚠ NOT `geocoding_cache`. It is keyed on an address rather than on a truck, nothing in
// these tests asserts its contents, and it is expensive to refill — a cleared cache
// means every later run re-queries Nominatim, which is a live third party under a usage
// policy. Leaving it alone is the polite default; a test that needs it empty should
// clear its own key.
export async function resetTables(): Promise<void> {
  for (const table of TABLES_CHILD_FIRST) {
    // PostgREST requires a filter on a delete, so this matches every row by asking for
    // ids that are not the impossible all-zero UUID. A bare `.delete()` is rejected,
    // which is a guard against exactly the accident this function performs on purpose.
    const { error } = await supabaseAdmin
      .from(table)
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");

    if (error) throw error;
  }
}

// A truck to hang locations off. Returns the id rather than the row: every caller so far
// wants the foreign key, and returning the row would invite assertions on fixture data.
//
// The id is generated here rather than left to the column default so the caller has it
// before the insert resolves, and so a test can create two trucks without a round trip
// to tell them apart.
export async function seedTruck(name = "Test Truck"): Promise<string> {
  const id = randomUUID();

  const { error } = await supabaseAdmin.from("trucks").insert({ id, name, is_active: true });

  if (error) throw error;
  return id;
}
