// The fake-data map's types, frozen until Phase 6 deletes this file.
//
// `MapTruck` and `MapLocation` copy the `trucks` and `locations` rows of
// `src/lib/database.types.ts` at commit d018091, every field, with `source` narrowed as
// `types.ts` did at that commit. Checked in PR #166 with tsc: mutually assignable, equal
// keys. Why frozen: plan phase-5-schema-reset, decision #1 and its `map-types.ts`
// section. What the map shows until then: CLAUDE.md, UI Rules.
//
// ⚠ No imports in this file. Anything from `database.types` or `@/lib/types` follows
// the schema, which plan step 2 replaces.

export interface MapTruck {
  created_at: string;
  cuisine_type: string | null;
  description: string | null;
  id: string;
  instagram_handle: string | null;
  is_active: boolean;
  last_known_latitude: number | null;
  last_known_longitude: number | null;
  name: string;
}

export interface MapLocation {
  address_geocoded: string | null;
  address_raw: string | null;
  confidence: number;
  created_at: string;
  // Nullable: `TruckPopup.tsx:23–25` shows "Från …" when it is null.
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
}

// Derived client-side, never persisted — one per truck shown on the map.
export type MarkerColor = "green" | "yellow" | "grey";

export interface MarkerState {
  truck: MapTruck;
  location: MapLocation | null; // null → grey marker
  color: MarkerColor;
  latitude: number; // resolved from location, or truck's last_known
  longitude: number;
}
