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

// One seeded Gothenburg location. NOT a database row — the dictionary is a
// compiled-in data module (`src/lib/parser/dictionary.ts`), which is the whole
// point of the design: a dictionary hit resolves to coordinates with no network
// call and no query, and Nominatim is only the fallback for addresses the
// dictionary does not know.
//
// `match` holds every surface form a caption might use for this place — aliases,
// and the diacritic-free spellings Swedes routinely type. Matching is
// `extractLocation()`'s job (#65); this type only promises the strings exist.
//
// PROVENANCE, and why it is two fields rather than one. They answer different
// questions and collapsing them would lose the one that matters later:
//
//   `source`    where the COORDINATE came from. `nominatim` = produced by
//               `scripts/seed-dictionary.mjs` and reproducible by re-running it.
//               `manual` = a human typed or moved this pin, so re-running the
//               script will NOT reproduce it and must not clobber it.
//   `verified`  whether anyone has confirmed a truck actually parks here. Every
//               seeded entry starts `false` and stays there until real caption
//               data exists (Phase 8) — an accurate coordinate for a square is
//               still a guess about truck behaviour.
// EVERY field is `readonly`, and so is `DICTIONARY` itself. This is a module-level
// constant in a long-lived server process, so a mutation is not scoped to one
// request — it is permanent for that instance, and presents as a caption resolving
// differently depending on what the server happened to handle earlier.
//
// The realistic mistake is not malice but a matcher doing the obvious thing:
// `extractLocation()` (#65) wanting longest-alias-first reaches for
// `entry.match.sort(...)`, which sorts IN PLACE. Making that a compile error is far
// cheaper than the bug.
//
// It is EVERY field rather than the two obvious ones because a partial `readonly`
// is worse than none: it reads as "this is protected" while leaving
// `DICTIONARY[0].lat = 0` and `.verified = true` compiling clean. A first pass here
// marked only `id` and `match`, and the comment above it claimed the whole
// interface was covered — caught in review, and the reason the guarantee is now
// stated per-field rather than in prose.
export interface DictionaryEntry {
  readonly id: string;
  readonly match: readonly string[];
  readonly address: string;
  readonly lat: number;
  readonly lng: number;
  readonly source: "manual" | "nominatim";
  readonly verified: boolean;
}

// What `extractLocation()` returns on a hit (#65). Two fields, and the second is the
// reason this is an interface rather than just `DictionaryEntry`:
//
//   `entry`    the dictionary entry, which carries the coordinates and the canonical
//              address. This is what becomes the pin.
//   `matched`  the caption substring the entry was recognised FROM, spelling, casing
//              and Swedish genitive `s` intact — "jarntorget", "Nordstans".
//
// `matched` exists because the phase plan defines `address_raw` as "the text the
// location was resolved from (the matched caption substring, or the extracted
// address candidate)". `entry.match[0]` is not that: it is the canonical alias we
// recognised, not the text the truck wrote, and the two differ on exactly the rows
// where knowing the difference is worth something. The span is knowable only at the
// match, so returning it is the alternative to `services/locations.ts` (#68) redoing
// the work to recover it.
//
// `readonly` for the same reason `DictionaryEntry` is: `entry` aliases a module-level
// constant in a long-lived process, and a write through this shape would outlive the
// request that made it.
export interface LocationMatch {
  readonly entry: DictionaryEntry;
  readonly matched: string;
}
