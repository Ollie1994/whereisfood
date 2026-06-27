import { Truck, Location } from "./types";

// Phase 1 fake data — hardcoded for the map before Supabase is wired up.
// Real Gothenburg coordinates so markers land on the map (centre 57.7089, 11.9746).
// Covers all three marker states: green, yellow, grey.

const now = Date.now();
const hours = (h: number) => new Date(now + h * 60 * 60 * 1000).toISOString();

export const FAKE_TRUCKS: Truck[] = [
  // GREEN — manual post, active location, confidence 1.0
  {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Strömmingsluckan",
    instagram_handle: "strommingsluckan",
    cuisine_type: "Fisk & skaldjur",
    description: "Friterad strömming och potatismos.",
    is_active: true,
    last_known_latitude: 57.6997, // Järntorget
    last_known_longitude: 11.9529,
    created_at: hours(-720),
  },
  // YELLOW — webhook (Instagram), parsed location, confidence 0.51
  {
    id: "22222222-2222-2222-2222-222222222222",
    name: "Tacos & Tequila",
    instagram_handle: "tacosotequila_gbg",
    cuisine_type: "Mexikanskt",
    description: "Street tacos och churros.",
    is_active: true,
    last_known_latitude: 57.7039, // Magasinsgatan
    last_known_longitude: 11.9614,
    created_at: hours(-480),
  },
  // YELLOW — email lane, parsed location, confidence 0.4675
  {
    id: "33333333-3333-3333-3333-333333333333",
    name: "Falafel Express",
    instagram_handle: "falafelexpress",
    cuisine_type: "Falafel",
    description: "Vegansk falafel och hummus.",
    is_active: true,
    last_known_latitude: 57.7016, // Kungstorget
    last_known_longitude: 11.9668,
    created_at: hours(-240),
  },
  // GREY — no active location today, but has a last known position
  {
    id: "44444444-4444-4444-4444-444444444444",
    name: "Burgare på hjul",
    instagram_handle: "burgarepahjul",
    cuisine_type: "Hamburgare",
    description: "Smashburgare med rostad lök.",
    is_active: true,
    last_known_latitude: 57.7065, // Lindholmen
    last_known_longitude: 11.9385,
    created_at: hours(-1440),
  },
];

export const FAKE_LOCATIONS: Location[] = [
  // GREEN — manual: source_confidence 1.0 × parser_confidence 1.0 = 1.0
  {
    id: "aaaaaaaa-0000-0000-0000-000000000001",
    truck_id: "11111111-1111-1111-1111-111111111111",
    post_id: null,
    latitude: 57.6997,
    longitude: 11.9529,
    address_raw: "Järntorget, Göteborg",
    address_geocoded: "Järntorget, 413 04 Göteborg",
    starts_at: hours(-1),
    ends_at: hours(2),
    source: "manual",
    confidence: 1.0,
    parser_confidence: 1.0,
    source_confidence: 1.0,
    is_negation: false,
    expires_at: hours(2),
    created_at: hours(-1),
    updated_at: hours(-1),
  },
  // YELLOW — webhook: source_confidence 0.85 × parser_confidence 0.6 = 0.51
  {
    id: "aaaaaaaa-0000-0000-0000-000000000002",
    truck_id: "22222222-2222-2222-2222-222222222222",
    post_id: null,
    latitude: 57.7039,
    longitude: 11.9614,
    address_raw: "Magasinsgatan, Göteborg",
    address_geocoded: "Magasinsgatan, 411 18 Göteborg",
    starts_at: hours(-1),
    ends_at: hours(3),
    source: "webhook",
    confidence: 0.51,
    parser_confidence: 0.6,
    source_confidence: 0.85,
    is_negation: false,
    expires_at: hours(3),
    created_at: hours(-2),
    updated_at: hours(-2),
  },
  // YELLOW — email: source_confidence 0.55 × parser_confidence 0.85 = 0.4675
  {
    id: "aaaaaaaa-0000-0000-0000-000000000003",
    truck_id: "33333333-3333-3333-3333-333333333333",
    post_id: null,
    latitude: 57.7016,
    longitude: 11.9668,
    address_raw: "Kungstorget, Göteborg",
    address_geocoded: "Kungstorget, 411 17 Göteborg",
    starts_at: hours(-1),
    ends_at: hours(2),
    source: "email",
    confidence: 0.4675,
    parser_confidence: 0.85,
    source_confidence: 0.55,
    is_negation: false,
    expires_at: hours(2),
    created_at: hours(-3),
    updated_at: hours(-3),
  },
  // Truck 4 (Burgare på hjul) has NO location row → renders grey at last_known.
];
