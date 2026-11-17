import type { NewTruck, TruckPatch } from "@/lib/types";
import { BODY_ERRORS, type Parsed, isRecord, refuse, tooLong, unstorable } from "@/lib/validators/body";

// A truck body from `readJson`, checked and reduced to the keys a client may set. Pure: no
// clock, no env (`CLAUDE.md`, "Time"). `id` and `created_at` are never read, and every
// other unknown key is dropped too.

// The free-text bounds, in characters (`tooLong`), on the trimmed text that is stored
// (Phase 9 plan step 3, Q22; the values are the owner's, IS #379). A limit: only the app
// is bound; the schema has no CHECK (the plan: no migration), so SQL can write longer.
export const MAX_NAME = 80;
export const MAX_CUISINE = 50;
export const MAX_DESCRIPTION = 500;

export const TRUCK_ERRORS = {
  body: BODY_ERRORS.body,
  name: "Ange foodtruckens namn",
  nameLength: `Namnet får vara högst ${MAX_NAME} tecken`,
  handle: "Ogiltigt Instagram-konto: bara a–z, 0–9, punkt och understreck, högst 30 tecken",
  cuisine: "Ogiltig typ av mat",
  cuisineLength: `Typen av mat får vara högst ${MAX_CUISINE} tecken`,
  description: "Ogiltig beskrivning",
  descriptionLength: `Beskrivningen får vara högst ${MAX_DESCRIPTION} tecken`,
  active: "Ogiltig status",
  emptyPatch: BODY_ERRORS.emptyPatch,
} as const;

// Instagram's character set and length cap, as the plan's #29 has them.
const HANDLE = /^[a-z0-9._]{1,30}$/;

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

// A trimmed name; blank, not a string, or holding a character the database refuses
// (`unstorable`, IS #400) is refused. Its length is checked by the callers, with a message
// of its own (`MAX_NAME`).
function name(value: unknown): string | undefined {
  if (typeof value !== "string" || unstorable(value)) return undefined;
  return value.trim() || undefined;
}

// An optional text: absent, null or blank is none; not a string, or `unstorable`, is
// refused. Its length is checked as `name`'s.
function optionalText(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || unstorable(value)) return undefined;
  return value.trim() || null;
}

export function parseNewTruck(body: unknown): Parsed<NewTruck> {
  if (!isRecord(body)) return refuse(TRUCK_ERRORS.body);

  const truckName = name(body.name);
  if (truckName === undefined) return refuse(TRUCK_ERRORS.name);
  if (tooLong(truckName, MAX_NAME)) return refuse(TRUCK_ERRORS.nameLength);
  const instagram = handle(body.instagram_handle);
  if (instagram === undefined) return refuse(TRUCK_ERRORS.handle);
  const cuisine = optionalText(body.cuisine_type);
  if (cuisine === undefined) return refuse(TRUCK_ERRORS.cuisine);
  if (tooLong(cuisine, MAX_CUISINE)) return refuse(TRUCK_ERRORS.cuisineLength);
  const description = optionalText(body.description);
  if (description === undefined) return refuse(TRUCK_ERRORS.description);
  if (tooLong(description, MAX_DESCRIPTION)) return refuse(TRUCK_ERRORS.descriptionLength);
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
    if (tooLong(value, MAX_NAME)) return refuse(TRUCK_ERRORS.nameLength);
    patch.name = value;
  }
  if (body.instagram_handle !== undefined) {
    const value = handle(body.instagram_handle);
    if (value === undefined) return refuse(TRUCK_ERRORS.handle);
    patch.instagram_handle = value;
  }
  for (const [key, error, max, lengthError] of [
    ["cuisine_type", TRUCK_ERRORS.cuisine, MAX_CUISINE, TRUCK_ERRORS.cuisineLength],
    ["description", TRUCK_ERRORS.description, MAX_DESCRIPTION, TRUCK_ERRORS.descriptionLength],
  ] as const) {
    if (body[key] === undefined) continue;
    const value = optionalText(body[key]);
    if (value === undefined) return refuse(error);
    if (tooLong(value, max)) return refuse(lengthError);
    patch[key] = value;
  }
  if (body.is_active !== undefined) {
    if (typeof body.is_active !== "boolean") return refuse(TRUCK_ERRORS.active);
    patch.is_active = body.is_active;
  }

  if (Object.keys(patch).length === 0) return refuse(TRUCK_ERRORS.emptyPatch);
  return { ok: true, value: patch };
}
