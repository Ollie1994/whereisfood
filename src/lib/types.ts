import type { Database } from "@/lib/database.types";

// The row types are DERIVED from the generated Database types rather than
// hand-written (issue #48). Regenerate them in Git Bash (PowerShell 5.1's `>`
// re-encodes the file):
//   npx supabase gen types typescript --local > src/lib/database.types.ts
//
// A migration that adds, drops, renames or re-nullables a column changes these types,
// and every stale usage becomes a compile error. `locations.source` is a Postgres enum,
// so it arrives as `'admin' | 'owner'` with no narrowing here (Phase 5 plan, #18).
type TruckRow = Database["public"]["Tables"]["trucks"]["Row"];
type LocationRow = Database["public"]["Tables"]["locations"]["Row"];

export type Truck = TruckRow;

// Exactly what `LOCATION_COLUMNS` in `db/locations.ts` selects: every column except
// `created_by`, which no read returns (Phase 5 plan, #8). The db functions return rows
// UNCAST, so `tsc` fails if the select lacks a key of this type. Never `as Location`:
// a cast also compiles when the select leaves a column out (probed 2026-10-18, plan's
// "Functions and types").
export type Location = Omit<LocationRow, "created_by">;

// What an insert supplies: `Location` minus the columns the database fills (`id`,
// `created_at`, `updated_at`) and `cancelled_at` (an insert is never born cancelled),
// plus `created_by`. Every key is required, those with a column default included, so a
// caller states each value.
export type NewLocation = Omit<Location, "id" | "created_at" | "updated_at" | "cancelled_at"> & {
  created_by: string | null;
};

// What an edit may change: place, label and times. Never `created_by` (the
// `updated_at` trigger skips an UPDATE that clears it, `0001_baseline.sql`), never
// `cancelled_at` (that is `cancelLocation`).
export type LocationPatch = Partial<
  Pick<Location, "latitude" | "longitude" | "label" | "starts_at" | "ends_at">
>;
