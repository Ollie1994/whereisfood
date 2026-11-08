import { parseISO } from "date-fns";
import { isInGothenburg } from "@/lib/geo";
import { isTimestamp } from "@/lib/live";
import type { LocationPatch, NewLocation } from "@/lib/types";
import { isUuid } from "@/lib/validators/uuid";

// A location body from `readJson`, checked and reduced to the keys a client may set. Pure:
// no clock, no env (`CLAUDE.md`, "Time"). `created_by`, `source` and `cancelled_at` are
// never read, so a body can't set them (Phase 7 plan, #17); every other unknown key is
// dropped too. A limit: a dropped key beside a kept one is dropped silently, so a patch
// holding `truck_id` and `label` changes the label only. The plan's acceptance criteria
// show the truck read-only on an edit (the form is #227's).

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The field checks: each gives the field's value, or undefined to refuse it. An absent key
// is refused too, except by `label`, which reads it as null; `parseLocationPatch` skips
// absent keys before calling them.

// A number, not a numeric string.
function coordinate(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

// Absent, null or blank is no label. A limit: no length or character bound, and the
// schema has none either (`0001_baseline.sql`). Until the Owners phase only the admin
// writes one, through `/api/admin/*`.
function label(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  return value.trim() || null;
}

// With an offset, as `isTimestamp` requires: one without would be read in the server's own
// zone. Its UTC year is 0001–9998. `toISOString` writes 0001–9999 as four digits, and local
// Postgres refused the forms it writes outside that, `0000-12-31T23:30:00.000Z` and
// `+010000-01-01T00:30:00.000Z`, and took years 0001 and 9999. 9999 is left out because
// late on its last day Stockholm is in year 10000, and `stockholmMidnight` threw a
// RangeError for 9999-12-31, the day before it; every other day of years 0001 and 9999
// gave the day's start (PR #238). A limit: that guards the strings, not the dates, so an
// entry from 0001 to 9998 passes here and would cover every day. Nothing planned bounds
// an entry's length or far end: open decision 9 would refuse only one that has already
// ended. Also a limit: `Date` keeps milliseconds,
// so digits past them are dropped: `…00.0001Z` and `…00.0009Z` both read as `…00.000Z`, and
// an entry between them is refused as `order` (pinned in the test).
function timestamp(value: unknown): Date | undefined {
  if (!isTimestamp(value)) return undefined;
  const date = parseISO(value);
  const year = date.getUTCFullYear();
  return year >= 1 && year <= 9998 ? date : undefined;
}

const refuse = (error: string): { ok: false; error: string } => ({ ok: false, error });

export function parseNewLocation(body: unknown): Parsed<NewLocationInput> {
  if (!isRecord(body)) return refuse(LOCATION_ERRORS.body);

  const truckId = body.truck_id;
  if (typeof truckId !== "string" || !isUuid(truckId)) return refuse(LOCATION_ERRORS.truck);

  const latitude = coordinate(body.latitude);
  const longitude = coordinate(body.longitude);
  if (latitude === undefined || longitude === undefined) return refuse(LOCATION_ERRORS.position);
  if (!isInGothenburg(latitude, longitude)) return refuse(LOCATION_ERRORS.outside);

  const name = label(body.label);
  if (name === undefined) return refuse(LOCATION_ERRORS.label);

  const startsAt = timestamp(body.starts_at);
  if (!startsAt) return refuse(LOCATION_ERRORS.startsAt);
  const endsAt = timestamp(body.ends_at);
  if (!endsAt) return refuse(LOCATION_ERRORS.endsAt);
  if (endsAt.getTime() <= startsAt.getTime()) return refuse(LOCATION_ERRORS.order);

  return {
    ok: true,
    value: {
      truck_id: truckId,
      latitude,
      longitude,
      label: name,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
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
    if (value === undefined) return refuse(LOCATION_ERRORS.position);
    patch[key] = value;
  }

  if (body.label !== undefined) {
    const name = label(body.label);
    if (name === undefined) return refuse(LOCATION_ERRORS.label);
    patch.label = name;
  }

  for (const [key, error] of [
    ["starts_at", LOCATION_ERRORS.startsAt],
    ["ends_at", LOCATION_ERRORS.endsAt],
  ] as const) {
    if (body[key] === undefined) continue;
    const value = timestamp(body[key]);
    if (!value) return refuse(error);
    patch[key] = value.toISOString();
  }

  return Object.keys(patch).length === 0 ? refuse(LOCATION_ERRORS.emptyPatch) : { ok: true, value: patch };
}
