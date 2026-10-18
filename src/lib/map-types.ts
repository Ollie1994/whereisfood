// The fake-data map's types, frozen until Phase 6 deletes this file.
//
// `MapTruck` and `MapLocation` copy the `trucks` and `locations` rows of
// `src/lib/database.types.ts` at commit d018091, every field, with `source` narrowed as
// `types.ts` did at that commit. To recheck, against `Truck`/`Location` from `types.ts`
// at d018091, with `Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false`:
// `Same<MapTruck, Truck>`, `Same<MapLocation, Location>` and `Same` of each pair's
// `keyof` are all `true` (run in PR #166, with a dropped-key control that failed).
// Why frozen: plan phase-5-schema-reset, decision #1 and its `map-types.ts` section.
// What the map shows until then: CLAUDE.md, UI Rules.
//
// ⚠ No imports in this file, and `type` aliases rather than interfaces (another file
// can extend an interface by module augmentation). What catches a copy re-derived from
// the Phase 5 schema is `npx tsc --noEmit`: `fake-data.ts` and `useMapLibre.tsx` use
// `confidence`, `is_negation` and `last_known_*`, which that schema lacks. With those
// four fields deleted here, tsc reported 12 errors in the two files (PR #166).

export type MapTruck = {
  created_at: string;
  cuisine_type: string | null;
  description: string | null;
  id: string;
  instagram_handle: string | null;
  is_active: boolean;
  last_known_latitude: number | null;
  last_known_longitude: number | null;
  name: string;
};

export type MapLocation = {
  address_geocoded: string | null;
  address_raw: string | null;
  confidence: number;
  created_at: string;
  // Nullable: TruckPopup's `hours` shows "Från …" when it is null.
  ends_at: string | null;
  expires_at: string;
  id: string;
  is_negation: boolean;
  latitude: number;
  longitude: number;
  parser_confidence: number;
  post_id: string | null;
  source: "manual" | "webhook" | "email";
  source_confidence: number;
  starts_at: string;
  truck_id: string;
  updated_at: string;
};

// Derived client-side, never persisted — one per truck shown on the map.
export type MarkerColor = "green" | "yellow" | "grey";

export type MarkerState = {
  truck: MapTruck;
  location: MapLocation | null; // null → grey marker
  color: MarkerColor;
  latitude: number; // resolved from location, or truck's last_known
  longitude: number;
};
