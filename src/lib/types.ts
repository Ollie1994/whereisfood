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

// Row shape of the `posts` table — raw incoming data, stored before parsing.
// `source` is the six-value union (distinct from Location.source's three values).
export interface Post {
  id: string;
  truck_id: string;
  instagram_post_id: string | null;
  caption: string | null;
  source: "instagram" | "facebook" | "tiktok" | "email" | "manual" | "webhook";
  posted_at: string;
  raw_json: Record<string, unknown>;
  parsing_status: "pending" | "parsed" | "failed" | "skipped";
  created_at: string;
}

// Insertable shape of a posts row: everything the caller supplies, minus the two
// columns the DB generates (id, created_at). Lives here (not in the db layer) so
// IngestResult can reference it without types.ts depending on db/ — the ingestion
// service builds a NewPost and the deferred insert returns the full Post.
export type NewPost = Omit<Post, "id" | "created_at">;

// Webhook lane payload sent by Make.com to POST /api/ingest.
export interface IngestPayload {
  truck_id: string;
  caption: string;
  instagram_post_id?: string; // omitted when the post is not from Instagram
  source_platform: "instagram" | "facebook" | "tiktok";
}

// Mailgun inbound webhook payload fields used by the email lane (POST /api/email).
// `timestamp`/`token`/`signature` verify the HMAC; `recipient` yields the truck_id.
export interface EmailPayload {
  recipient: string;
  "body-plain": string;
  timestamp: string;
  token: string;
  signature: string;
}

// Result of the synchronous prepare step (validate + verify truck) before the
// deferred raw insert. Discriminated on `ok`: the route maps a failure to its
// status code, or persists the built `post` (a NewPost — no id/created_at yet)
// inside after(). The prepare functions only ever return status 400; the 401 is
// reserved for the route's own X-Make-Secret check.
export type IngestResult =
  | { ok: true; post: NewPost }
  | { ok: false; status: 400 | 401; error: string };

// Derived client-side, never persisted — one per truck shown on the map.
export type MarkerColor = "green" | "yellow" | "grey";

export interface MarkerState {
  truck: Truck;
  location: Location | null; // null → grey marker
  color: MarkerColor;
  latitude: number; // resolved from location, or truck's last_known
  longitude: number;
}
