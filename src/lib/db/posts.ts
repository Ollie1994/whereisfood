import { supabaseAdmin } from "@/lib/supabase";
import type { Post } from "@/lib/types";

// The insertable shape of a posts row: every field the caller supplies, minus the
// two the DB generates (id, created_at). parsing_status stays required — the
// ingestion service sets it explicitly (defaulting to 'pending', mirroring the
// column default) rather than relying on the DB to fill it.
export type NewPost = Omit<Post, "id" | "created_at">;

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
