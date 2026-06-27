export interface Truck {
  id: string;
  name: string;
  instagram_handle: string | null;
  cuisine_type: string | null;
  description: string | null;
  is_active: boolean;
  last_known_latitude: number | null;
  last_known_longitude: number | null;
  created_at: string;
}

export interface Location {
  id: string;
  truck_id: string;
  post_id: string | null;
  latitude: number;
  longitude: number;
  address_raw: string | null;
  address_geocoded: string | null;
  starts_at: string;
  ends_at: string | null;
  source: "manual" | "webhook" | "email";
  confidence: number;
  parser_confidence: number;
  source_confidence: number;
  is_negation: boolean;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

// Derived client-side, never persisted — one per truck shown on the map.
export type MarkerColor = "green" | "yellow" | "grey";

export interface MarkerState {
  truck: Truck;
  location: Location | null; // null → grey marker
  color: MarkerColor;
  latitude: number; // resolved from location, or truck's last_known
  longitude: number;
}
