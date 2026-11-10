import type { NewTruck, TruckPatch } from "@/lib/types";
import type { Parsed } from "@/lib/validators/location";

// A truck body from `readJson`, checked and reduced to the keys a client may set. Pure: no
// clock, no env (`CLAUDE.md`, "Time"). `id` and `created_at` are never read, and every
// other unknown key is dropped too.

export const TRUCK_ERRORS = {
  body: "Begärans innehåll måste vara ett objekt",
  name: "Ange foodtruckens namn",
  handle: "Ogiltigt Instagram-konto: bara a–z, 0–9, punkt och understreck, högst 30 tecken",
  cuisine: "Ogiltig typ av mat",
  description: "Ogiltig beskrivning",
  active: "Ogiltig status",
  emptyPatch: "Ändringen innehåller inget att ändra",
} as const;

// Instagram's character set and length cap, as the plan's #29 has them.
const HANDLE = /^[a-z0-9._]{1,30}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const refuse = (error: string): { ok: false; error: string } => ({ ok: false, error });

// The field checks: each gives the field's value, or undefined to refuse it.

// A handle in its one stored form (#29): trimmed, a leading `@` stripped, lower-cased, and
// empty as null, so "@StreetFoodGBG " and "streetfoodgbg" are one account and two trucks
// with no handle aren't a false duplicate. In that order: "@ foo" keeps its space and is
// refused. Absent or null is no handle. A limit (#29): a period at either end passes.
function handle(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const normal = value.trim().replace(/^@/, "").toLowerCase();
  if (normal === "") return null;
  return HANDLE.test(normal) ? normal : undefined;
}

// A trimmed name; blank or not a string is refused. A limit: no length bound, and the
// schema has none either (`0001_baseline.sql`). Only the admin writes one.
function name(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.trim() || undefined;
}

// An optional text: absent, null or blank is none. No length bound, as `name`.
function optionalText(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  return value.trim() || null;
}

export function parseNewTruck(body: unknown): Parsed<NewTruck> {
  if (!isRecord(body)) return refuse(TRUCK_ERRORS.body);

  const truckName = name(body.name);
  if (truckName === undefined) return refuse(TRUCK_ERRORS.name);
  const instagram = handle(body.instagram_handle);
  if (instagram === undefined) return refuse(TRUCK_ERRORS.handle);
  const cuisine = optionalText(body.cuisine_type);
  if (cuisine === undefined) return refuse(TRUCK_ERRORS.cuisine);
  const description = optionalText(body.description);
  if (description === undefined) return refuse(TRUCK_ERRORS.description);
  // A new truck is active unless the body says otherwise.
  const active = body.is_active === undefined ? true : body.is_active;
  if (typeof active !== "boolean") return refuse(TRUCK_ERRORS.active);

  return {
    ok: true,
    value: {
      name: truckName,
      instagram_handle: instagram,
      cuisine_type: cuisine,
      description,
      is_active: active,
    },
  };
}

// Each key the patch holds, checked alone, as `parseNewTruck` checks it. A patch with none
// of these keys is refused, since the db layer throws on an empty one.
export function parseTruckPatch(body: unknown): Parsed<TruckPatch> {
  if (!isRecord(body)) return refuse(TRUCK_ERRORS.body);
  const patch: TruckPatch = {};

  if (body.name !== undefined) {
    const value = name(body.name);
    if (value === undefined) return refuse(TRUCK_ERRORS.name);
    patch.name = value;
  }
  if (body.instagram_handle !== undefined) {
    const value = handle(body.instagram_handle);
    if (value === undefined) return refuse(TRUCK_ERRORS.handle);
    patch.instagram_handle = value;
  }
  for (const [key, error] of [
    ["cuisine_type", TRUCK_ERRORS.cuisine],
    ["description", TRUCK_ERRORS.description],
  ] as const) {
    if (body[key] === undefined) continue;
    const value = optionalText(body[key]);
    if (value === undefined) return refuse(error);
    patch[key] = value;
  }
  if (body.is_active !== undefined) {
    if (typeof body.is_active !== "boolean") return refuse(TRUCK_ERRORS.active);
    patch.is_active = body.is_active;
  }

  if (Object.keys(patch).length === 0) return refuse(TRUCK_ERRORS.emptyPatch);
  return { ok: true, value: patch };
}
