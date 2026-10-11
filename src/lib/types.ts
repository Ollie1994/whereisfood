import type { Database } from "@/lib/database.types";

// The row types are DERIVED from the generated Database types rather than
// hand-written (issue #48). Regenerate with:
//   npx supabase gen types typescript --local > src/lib/database.types.ts
//
// Consequence: a migration that adds, drops, renames, or re-nullables a column
// changes these types automatically, and every stale usage becomes a compile
// error. That is the whole point — the previous hand-written interfaces silently
// disagreed with the schema on six `locations` columns (#49) and three others.
//
// The only fields overridden below are text columns whose allowed values are
// pinned by a CHECK constraint. Postgres CHECK constraints carry no type
// information into the generated types (only real PG enum types do), so they
// arrive as plain `string` and are narrowed here to the unions the app relies on.
//
// These still describe the CURRENT schema, which keeps the old design's columns
// until Phase 5 replaces it; the types are regenerated with it.
type TruckRow = Database["public"]["Tables"]["trucks"]["Row"];
type LocationRow = Database["public"]["Tables"]["locations"]["Row"];

// Exact match — no CHECK-constrained columns, so no narrowing needed.
export type Truck = TruckRow;

// `source` is narrowed to the three values `locations_source_check` allows.
export type Location = Omit<LocationRow, "source"> & {
  source: "manual" | "webhook" | "email";
};

// Insertable shape of a `locations` row: everything the caller supplies, minus the
// three columns the database generates. Derived from `Location` — itself derived from
// the generated row type (#48) — so a migration that adds or re-nullables a column
// makes every stale insert a compile error.
//
// ⚠ `updated_at` IS OMITTED ALONGSIDE `id` AND `created_at`, and it is the one worth
// stating. It has a `now()` default like `created_at`, so an insert need not supply it
// — but unlike `created_at` it is *meant* to change later, and nothing updates it yet.
// Omitting it here says "the insert does not set this", not "this never changes"; when
// an update path exists it will set the column explicitly rather than widen this type.
//
// Everything else stays REQUIRED even where the column has a default, and that is
// deliberate: a silent default is how a row ends up with a value nobody chose, so
// making every column required means a caller cannot forget one.
export type NewLocation = Omit<Location, "id" | "created_at" | "updated_at">;

// Derived client-side, never persisted — one per truck shown on the map.
export type MarkerColor = "green" | "yellow" | "grey";

export interface MarkerState {
  truck: Truck;
  location: Location | null; // null → grey marker
  color: MarkerColor;
  latitude: number; // resolved from location, or truck's last_known
  longitude: number;
}
