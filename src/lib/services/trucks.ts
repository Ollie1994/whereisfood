import { listAllTrucks } from "@/lib/db/trucks";
import type { Truck } from "@/lib/types";

// Admin truck logic (Phase 7 plan, "Functions and types"). No HTTP; the database only
// through the db layer. Creating and editing a truck are #230's.

// Every truck for the admin, inactive ones included, by name.
export async function listTrucks(): Promise<Truck[]> {
  return listAllTrucks();
}
