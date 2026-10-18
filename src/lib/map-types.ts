// The fake-data map's types: FROZEN, HAND-WRITTEN copies of the old schema's rows.
//
// The map still runs the old design (grey markers at `last_known_*`, colours from
// `confidence`) until Phase 6 replaces its data source. Phase 5 regenerates the
// generated Supabase types from a schema without those columns, so the map can't keep
// deriving from them: these are literal copies of `Truck` and `Location` as `types.ts`
// derived them before Phase 5, every field kept (plan phase-5-schema-reset, decision #1).
//
// ⚠ Never import the generated types here. A derived type would change with the
// schema, which is what this file exists to stop. Phase 6 deletes the file.

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
  // Nullable here, unlike the new schema: `TruckPopup` shows "Från …" for a null end.
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
