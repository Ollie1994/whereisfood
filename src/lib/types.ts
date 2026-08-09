import type { Database } from "@/lib/database.types";

// The three row types are DERIVED from the generated Database types rather than
// hand-written (issue #48). Regenerate with:
//   npx supabase gen types typescript --local > src/lib/database.types.ts
//
// Consequence: a migration that adds, drops, renames, or re-nullables a column
// changes these types automatically, and every stale usage becomes a compile
// error. That is the whole point — the previous hand-written interfaces silently
// disagreed with the schema on six `locations` columns (#49) and three others.
//
// The only fields overridden below are text columns whose allowed values are
// pinned by a CHECK constraint. Postgres CHECK constraints carry no type
// information into the generated types (only real PG enum types do), so they
// arrive as plain `string` and are narrowed here to the unions the app relies on.
type TruckRow = Database["public"]["Tables"]["trucks"]["Row"];
type LocationRow = Database["public"]["Tables"]["locations"]["Row"];
type PostRow = Database["public"]["Tables"]["posts"]["Row"];

// Exact match — no CHECK-constrained columns, so no narrowing needed.
export type Truck = TruckRow;

// `source` is the three-value LANE (locations_source_check), distinct from
// Post["source"]'s six-value platform union.
export type Location = Omit<LocationRow, "source"> & {
  source: "manual" | "webhook" | "email";
};

// Row shape of the `posts` table — raw incoming data, stored before parsing.
// `raw_json` is narrowed from the generated `Json` to a plain object: the column
// always holds the incoming payload object (never a bare scalar or array), and
// `Record<string, unknown>` keeps property access ergonomic for the parser.
export type Post = Omit<PostRow, "source" | "parsing_status" | "raw_json"> & {
  source: "instagram" | "facebook" | "tiktok" | "email" | "manual" | "webhook";
  parsing_status: "pending" | "parsed" | "failed" | "skipped";
  raw_json: Record<string, unknown>;
};

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
