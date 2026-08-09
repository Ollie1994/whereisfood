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
