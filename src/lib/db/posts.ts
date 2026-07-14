import { supabaseAdmin } from "@/lib/supabase";
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
    .insert(post)
    .select()
    .single();

  if (error) throw error;
  return data as Post;
}
