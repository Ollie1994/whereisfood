import { parseISO } from "date-fns";
import { isInGothenburg } from "@/lib/geo";
import { isTimestamp } from "@/lib/live";
import type { LocationPatch, NewLocation } from "@/lib/types";
import { isUuid } from "@/lib/validators/uuid";

// A location body from `readJson`, checked and reduced to the keys a client may set. Pure:
// no clock, no env (`CLAUDE.md`, "Time"). `created_by`, `source` and `cancelled_at` are
// never read, so a body can't set them (Phase 7 plan, #17); every other unknown key is
// dropped too.

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

// A new entry as a client sends it: the service adds `created_by` and `source` (#17).
export type NewLocationInput = Omit<NewLocation, "created_by" | "source">;

export const LOCATION_ERRORS = {
  body: "Begärans innehåll måste vara ett objekt",
  truck: "Ogiltig foodtruck",
  position: "Ogiltig position",
  outside: "Platsen ligger utanför Göteborg",
  label: "Ogiltigt platsnamn",
  startsAt: "Ogiltig starttid",
  endsAt: "Ogiltig sluttid",
  order: "Sluttiden måste vara efter starttiden",
  emptyPatch: "Ändringen innehåller inget att ändra",
} as const;

type Field<T> = { ok: true; value: T } | { ok: false };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// A number, not a numeric string.
function coordinate(value: unknown): Field<number> {
  return typeof value === "number" && Number.isFinite(value) ? { ok: true, value } : { ok: false };
}

// Absent, null or blank is no label.
function label(value: unknown): Field<string | null> {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false };
  const trimmed = value.trim();
  return { ok: true, value: trimmed === "" ? null : trimmed };
}

// With an offset, as `isTimestamp` requires: one without would be read in the server's own
// zone. Stored as the instant in UTC.
function timestamp(value: unknown): Field<string> {
  return isTimestamp(value) ? { ok: true, value: parseISO(value).toISOString() } : { ok: false };
}

const refuse = (error: string): { ok: false; error: string } => ({ ok: false, error });

export function parseNewLocation(body: unknown): Parsed<NewLocationInput> {
  if (!isRecord(body)) return refuse(LOCATION_ERRORS.body);

  const truckId = body.truck_id;
  if (typeof truckId !== "string" || !isUuid(truckId)) return refuse(LOCATION_ERRORS.truck);

  const latitude = coordinate(body.latitude);
  const longitude = coordinate(body.longitude);
  if (!latitude.ok || !longitude.ok) return refuse(LOCATION_ERRORS.position);
  if (!isInGothenburg(latitude.value, longitude.value)) return refuse(LOCATION_ERRORS.outside);

  const name = label(body.label);
  if (!name.ok) return refuse(LOCATION_ERRORS.label);

  const startsAt = timestamp(body.starts_at);
  if (!startsAt.ok) return refuse(LOCATION_ERRORS.startsAt);
  const endsAt = timestamp(body.ends_at);
  if (!endsAt.ok) return refuse(LOCATION_ERRORS.endsAt);
  if (Date.parse(endsAt.value) <= Date.parse(startsAt.value)) return refuse(LOCATION_ERRORS.order);

  return {
    ok: true,
    value: {
      truck_id: truckId,
      latitude: latitude.value,
      longitude: longitude.value,
      label: name.value,
      starts_at: startsAt.value,
      ends_at: endsAt.value,
    },
  };
}

// Each key the patch holds, checked alone. Across fields (the box, the time order) is
// `editEntry`'s, on the merged row (plan, "Functions and types"). A patch with none of
// these keys is refused, since the db layer throws on an empty one.
export function parseLocationPatch(body: unknown): Parsed<LocationPatch> {
  if (!isRecord(body)) return refuse(LOCATION_ERRORS.body);
  const patch: LocationPatch = {};

  for (const key of ["latitude", "longitude"] as const) {
    if (body[key] === undefined) continue;
    const value = coordinate(body[key]);
    if (!value.ok) return refuse(LOCATION_ERRORS.position);
    patch[key] = value.value;
  }

  if (body.label !== undefined) {
    const name = label(body.label);
    if (!name.ok) return refuse(LOCATION_ERRORS.label);
    patch.label = name.value;
  }

  for (const [key, error] of [
    ["starts_at", LOCATION_ERRORS.startsAt],
    ["ends_at", LOCATION_ERRORS.endsAt],
  ] as const) {
    if (body[key] === undefined) continue;
    const value = timestamp(body[key]);
    if (!value.ok) return refuse(error);
    patch[key] = value.value;
  }

  return Object.keys(patch).length === 0 ? refuse(LOCATION_ERRORS.emptyPatch) : { ok: true, value: patch };
}
