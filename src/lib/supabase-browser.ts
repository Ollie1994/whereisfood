import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// The anon-key client, browser safe. What it may be used for is `CLAUDE.md`'s
// ("Supabase"). Unlike `supabase.ts`, it has no build guard: a server module can import
// it and `next build` passes.
//
// Its own module because `src/lib/supabase.ts` throws at import without
// `SUPABASE_SERVICE_ROLE_KEY`, which is undefined in the browser, and imports
// `server-only`.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
if (!supabaseAnonKey) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_ANON_KEY");

export const supabaseClient = createClient<Database>(supabaseUrl, supabaseAnonKey);
