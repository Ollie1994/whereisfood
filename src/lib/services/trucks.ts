import { insertTruck, listAllTrucks, updateTruck } from "@/lib/db/trucks";
import { hasCode, namesConstraint } from "@/lib/services/postgres";
import type { NewTruck, Truck, TruckPatch } from "@/lib/types";

// Admin truck logic (Phase 7 plan, "Functions and types"). No HTTP: a refusal is a reason,
// which the route turns into a status. The database only through the db layer, which never
// deletes: "set inactive" is an edit of `is_active`.

export type TruckRefusal = { ok: false; reason: "not-found" | "conflict"; error: string };
export type TruckResult = { ok: true; truck: Truck } | TruckRefusal;

export const TRUCK_RESULT_ERRORS = {
  handleTaken: "Instagram-kontot används redan av en annan foodtruck",
  notFound: "Foodtrucken finns inte",
} as const;

// The unique handle, by its name: `23505` is every unique index's code
// (`db-trucks.test.ts` pins the name).
const isHandleTaken = (error: unknown) => hasCode(error, "23505") && namesConstraint(error, "trucks_instagram_handle_key");

// Every truck for the admin, inactive ones included, by name.
export async function listTrucks(): Promise<Truck[]> {
  return listAllTrucks();
}

// A new truck. A handle another truck has is a conflict; the validator has already put it in
// its one form (#29), so a different case, `@` or spacing can't get past this.
//
// A limit: the unique index compares the text as stored, so this holds only while every
// stored handle is in that form. Every app write is; `seed.sql`'s three are, and so were all
// four local handles (2026-11-10, `!~ '^[a-z0-9._]{1,30}$'` counted 0). A row written
// outside the app in another form would let its account in twice.
export async function createTruck(input: NewTruck): Promise<TruckResult> {
  try {
    return { ok: true, truck: await insertTruck(input) };
  } catch (error) {
    if (isHandleTaken(error)) return { ok: false, reason: "conflict", error: TRUCK_RESULT_ERRORS.handleTaken };
    throw error;
  }
}

// An edit, "set inactive" included. A missing truck is not found; a handle another truck has
// is a conflict.
export async function editTruck(id: string, patch: TruckPatch): Promise<TruckResult> {
  try {
    const truck = await updateTruck(id, patch);
    return truck ? { ok: true, truck } : { ok: false, reason: "not-found", error: TRUCK_RESULT_ERRORS.notFound };
  } catch (error) {
    if (isHandleTaken(error)) return { ok: false, reason: "conflict", error: TRUCK_RESULT_ERRORS.handleTaken };
    throw error;
  }
}
