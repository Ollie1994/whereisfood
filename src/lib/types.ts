import type { Database } from "@/lib/database.types";
// `ParseResult` holds `extractTime`'s return whole rather than splitting it into
// three fields, so this module has a second type-only import. It is an EDGE OUT OF
// types.ts INTO the parser, which is the reverse of every other edge here, and it is
// safe in both directions:
//
//   NO RUNTIME CYCLE. `import type` is fully erased, and `time.ts` imports nothing
//   from `types.ts` anyway — the emitted JS for this module still imports nothing at
//   all, which is exactly what `types.test.ts` asserts.
//
//   NO PURITY HOLE. `parser/purity.test.ts` allowlists `@/lib/types` for parser
//   modules and records the obligation that an allowlisted module OUTSIDE the globbed
//   directory must itself be asserted. This edge points the other way — into a file
//   that glob already covers — so it adds an entry to `types.test.ts`'s allowlist
//   without extending any claim past an asserted file.
import type { ExtractedTime } from "@/lib/parser/time";

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

// Insertable shape of a `locations` row: everything the caller supplies, minus the
// three columns the database generates. Derived from `Location` — itself derived from
// the generated row type (#48) — so a migration that adds or re-nullables a column
// makes every stale insert a compile error.
//
// ⚠ `updated_at` IS OMITTED ALONGSIDE `id` AND `created_at`, and it is the one worth
// stating. It has a `now()` default like `created_at`, so an insert need not supply it
// — but unlike `created_at` it is *meant* to change later, and nothing updates it yet.
// Omitting it here says "the insert does not set this", not "this never changes"; when
// an update path exists it will set the column explicitly rather than widen this type.
//
// Everything else stays REQUIRED even where the column has a default, and that is
// deliberate. `is_negation` defaults to false and `confidence`/`parser_confidence`/
// `source_confidence` are NOT NULL — the phase plan lists "every NOT NULL column on
// `locations` is set on insert" as an acceptance criterion precisely because a silent
// default is how a row ends up scored 0 or flagged wrong. Making them required means
// the service cannot forget one.
//
// Defined here rather than in the locations-service issue because `db/locations.ts` is
// the first module that needs it, and defining it later would make the db layer depend
// on an issue blocked by the db layer.
export type NewLocation = Omit<Location, "id" | "created_at" | "updated_at">;

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

// What `parseCaption()` (#67) returns — the whole pure pipeline's answer about one
// caption, and the single seam a future ML parser swaps behind. It says what the
// caption STATED; nothing here has touched a database, a network or a clock, so a
// `fallback` place is an address we have not geocoded and may never resolve.
//
// ⚠ TWO FIELDS DIFFER FROM #67's SHAPE, and both changes delete states that cannot
// happen rather than adding capability — the same move `confidence.ts` made against
// #66's input shape, for the same reason.
//
//   #67 lists "the extracted location entry or null" and "address candidate or null"
//   as two fields. They are mutually exclusive by construction: `parseCaption` runs
//   `extractAddressCandidate` ONLY when `extractLocation` missed, so
//   `{ location: <entry>, addressCandidate: "Kungsgatan 12" }` is unreachable. Two
//   nullable fields spell four states for three real ones.
//
//   That is not just tidiness here. `scoreConfidence` takes exactly this three-state
//   axis (`"dictionary" | "fallback" | null`), so with two flat fields `parseCaption`
//   would have to REDERIVE it with a conditional — a hand-written mapping between two
//   shapes that must agree, which is a place a drift can live. With the union it is a
//   property read, and the two cannot disagree.
//
//   #67 lists "start/end instants" and "the time kind" as three fields. `extractTime`
//   already returns them as one object, and splitting it spells three more impossible
//   states: a `kind` with no instants, a `startsAt` with no `kind`, an `endsAt` with
//   no `startsAt`. Holding `ExtractedTime` whole keeps #67's actual requirement — "the
//   `kind` must survive into `ParseResult`" — and keeps it unsplittable.
export type ResolvedPlace =
  // `extractLocation` hit the dictionary. The coordinates are already in hand
  // (`match.entry.lat/lng`) and NO geocode is needed or wanted — that is the whole
  // point of the dictionary carrying coordinates. `match.matched` is the caption
  // substring, which is what `address_raw` is defined as.
  | { readonly kind: "dictionary"; readonly match: LocationMatch }
  // `extractLocation` missed and `extractAddressCandidate` found an address-shaped
  // substring. `address` is a QUERY for the geocoder, not a resolved place: it may
  // geocode to nothing, or outside Gothenburg, in which case `services/locations.ts`
  // writes no row at all and marks the post `'failed'`.
  | { readonly kind: "fallback"; readonly address: string }
  // The caption named no place this parser can recognise. Scores 0.0 or 0.2 and
  // never becomes a pin.
  | null;

export interface ParseResult {
  // FIRST FIELD BECAUSE IT IS THE FIRST QUESTION. A negation is not a low-confidence
  // location, it is a different KIND of post: `services/locations.ts` (#69) DELETES
  // overlapping locations and writes no row. Every other field below is at its
  // empty/default value when this is true — see `parseCaption`'s bail.
  readonly isNegation: boolean;
  // Three states, one field. See the note above.
  readonly place: ResolvedPlace;
  // NEVER null: `extractDate` falls back to the `parsedAt` it was given, so a caption
  // naming no day resolves to the day the post was made. That is the correct answer,
  // not a missing one.
  //
  // ⚠ IT IS NOT GUARANTEED TO BE A `"yyyy-MM-dd"` STOCKHOLM DATE, and an earlier
  // version of this comment said it was. Non-null and well-formed are different
  // claims, and only the first is enforced. `extractDate` returns `parsedAt`
  // UNTOUCHED on every non-match path — including one it cannot read — so
  // `parseCaption("Järntorget 11-14", "not-a-date")` yields `date: "not-a-date"` with
  // a resolved place and a score of 0.6. Every module in the chain deferred the check
  // to the next: `date.ts` guards only against a throw and says the value "moves
  // downstream rather than being neutralised", `index.ts` documents the derivation
  // (H3) without checking it, and this comment then asserted the format nobody
  // validates. Tracked as #95, which picks where the check belongs.
  //
  // Not reachable from the two real callers, which both derive it from a
  // `timestamptz`. `scripts/reparse.mjs` (#71) taking post ids from a command line is
  // where it becomes reachable.
  readonly date: string;
  // The window, or null when the caption stated no time at all. `endsAt` may be null
  // INSIDE this (an opening time with no close), which is why it stays one object —
  // the service's `expires_at` fallback keys on exactly that distinction.
  //
  // `readonly` stops here and does not reach inside, unlike `LocationMatch` above.
  // That is deliberate and not an oversight: `LocationMatch.entry` ALIASES a
  // module-level constant in a long-lived process, so a write through it would
  // outlive the request. An `ExtractedTime` is built fresh by every `extractTime`
  // call and aliases nothing, so there is no such hazard to guard against.
  readonly time: ExtractedTime | null;
  // `parser_confidence` — one of the two factors. `services/locations.ts` multiplies
  // it by the lane's `source_confidence` to get the `confidence` the map filters on.
  // Never applied here: this module does not know which lane the caption arrived on.
  readonly parserConfidence: number;
}
