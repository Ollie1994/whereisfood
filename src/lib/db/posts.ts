import { supabaseAdmin } from "@/lib/supabase";
import type { Json } from "@/lib/database.types";
import type { NewPost, Post } from "@/lib/types";

// NewPost (the insertable posts-row shape, minus DB-generated id/created_at) is
// defined in @/lib/types and re-exported here so db-layer callers can keep
// importing it from the db module.
export type { NewPost };

// DB access only — inserts a raw post via the service role and returns the stored
// row. Propagates any Postgres error unchanged; notably the 23505 unique-violation
// on a duplicate instagram_post_id (posts_instagram_post_id_unique). Catching /
// interpreting that is the ingestion service's job, not this layer's.
export async function insertPost(post: NewPost): Promise<Post> {
  const { data, error } = await supabaseAdmin
    .from("posts")
    .insert({
      ...post,
      // The generated column type is `Json` (a recursive JSON union); the app
      // types raw_json as a plain object for ergonomic property access. An object
      // of unknowns is structurally a Json object — TS just can't prove `unknown`
      // is Json — so this widening is safe. jsonb accepts it verbatim.
      raw_json: post.raw_json as Json,
    })
    .select()
    .single();

  if (error) throw error;

  // The `as Post` cast is gone for trucks but survives here in narrowed form:
  // posts.source and posts.parsing_status are CHECK-constrained text columns, and
  // a CHECK carries no type information into the generated types, so they arrive
  // as `string`. The DB constraint plus the NewPost union on the way in together
  // guarantee the value is in range — this only re-states what both ends enforce.
  // Converting the two CHECKs to real PG enum types would remove it entirely, at
  // the cost of making future value additions an ALTER TYPE migration.
  return data as Post;
}

// Record the outcome of the parse attempt. One column, one write — the service
// decides WHICH status; this only stores it.
//
// Not folded into the location insert: a post can reach a terminal status with no
// location row at all (a failed geocode, a caption naming no place, a cancellation),
// which is most of the reasons this function exists.
export async function updateParsingStatus(
  postId: string,
  status: Post["parsing_status"],
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("posts")
    .update({ parsing_status: status })
    .eq("id", postId);

  if (error) throw error;
}

// May this post become a `locations` row?
//
// ⚠ A `Record` RATHER THAN `status !== "skipped"`, and the difference is the whole
// reason this is a named predicate instead of an inline comparison. The negative form
// is a claim about the ONE value someone thought of; the set it belongs to is what
// keeps changing. Migration 0005 adds `'duplicate'`, which must also answer false —
// with a `Record` keyed on the union that addition is a compile error here until it
// is placed, and with `!== "skipped"` it is a crosspost silently becoming a second
// pin for the same truck.
//
// That is the phase's single largest defect class stated as a mechanism: the guard
// that covered the case its author had in mind and missed its neighbour. `sources.ts`
// and `confidence.ts` both take this shape for the same reason.
//
// WHY EACH VALUE ANSWERS AS IT DOES:
//
//   pending  the ordinary state of a post that has not been parsed yet.
//   failed   a geocode outage or an unreadable caption. Re-parseable by design —
//            plan decision #7 exists precisely so these can be recovered.
//   parsed   already produced a location. Still true: `scripts/reparse.mjs` (#71)
//            replays these while iterating on the parser, and the override matrix —
//            not this predicate — is what decides whether the replay wins.
//   skipped  a stale-but-signed Mailgun payload. CLAUDE.md is explicit that freshness
//            governs whether we ACT on a post, never whether we KEEP it, and this is
//            where "never act" is enforced. Three separate docs flag it as the Phase
//            3 dependency; it is one `false`, and this is it.
const PARSEABLE: Record<Post["parsing_status"], boolean> = {
  pending: true,
  failed: true,
  parsed: true,
  skipped: false,
};

export function isParseable(status: Post["parsing_status"]): boolean {
  return PARSEABLE[status];
}
