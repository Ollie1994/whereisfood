import type { Truck } from "@/lib/types";
import { parseNewTruck, parseTruckPatch } from "@/lib/validators/truck";

// The trucks screen's pure parts: the form's values and the requests they make. No fetch;
// `useTrucks` holds the state and the requests. The route checks every body again.

export const TRUCK_TEXTS = {
  // The owner's wording (#230).
  deactivateQuestion: "Sätta foodtrucken som inaktiv? Den försvinner från kartan.",
  saved: "Sparat.",
} as const;

export type TruckFormValues = {
  name: string;
  instagram: string;
  cuisine: string;
  description: string;
};

export type TruckRequest = { ok: true; body: Record<string, unknown> } | { ok: false; error: string };

export const emptyTruckForm = (): TruckFormValues => ({ name: "", instagram: "", cuisine: "", description: "" });

// A truck as the form shows it for an edit; a field with no value is empty.
export function truckFormFrom(truck: Truck): TruckFormValues {
  return {
    name: truck.name,
    instagram: truck.instagram_handle ?? "",
    cuisine: truck.cuisine_type ?? "",
    description: truck.description ?? "",
  };
}

function bodyOf(values: TruckFormValues): Record<string, unknown> {
  return {
    name: values.name,
    instagram_handle: values.instagram,
    cuisine_type: values.cuisine,
    description: values.description,
  };
}

// The body of `POST /api/admin/trucks`, checked here first by the route's own validator, so
// a missing name or a bad handle is said before any request. Sent as typed: the route
// stores the handle in its one form (#29).
export function truckCreateRequest(values: TruckFormValues): TruckRequest {
  const parsed = parseNewTruck(bodyOf(values));
  return parsed.ok ? { ok: true, body: bodyOf(values) } : { ok: false, error: parsed.error };
}

// The body of `PATCH /api/admin/trucks/[id]`: only the fields that differ from the truck as
// the form showed it. A form with nothing changed is sent as is, and the route answers it
// with its own message, as the location form's is.
export function truckEditRequest(values: TruckFormValues, truck: Truck): TruckRequest {
  const shown = bodyOf(truckFormFrom(truck));
  const typed = bodyOf(values);
  const body = Object.fromEntries(Object.entries(typed).filter(([key, value]) => value !== shown[key]));
  if (Object.keys(body).length === 0) return { ok: true, body };
  const parsed = parseTruckPatch(body);
  return parsed.ok ? { ok: true, body } : { ok: false, error: parsed.error };
}
