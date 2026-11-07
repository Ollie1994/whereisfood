import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// Browser safe: respects RLS through the anon key. For Auth only (the admin login,
// Phase 7), never to read or write data (`CLAUDE.md`, "Supabase"). Unused until the
// login screen imports it.
//
// Its own module because `src/lib/supabase.ts` throws at import without
// `SUPABASE_SERVICE_ROLE_KEY`, which is undefined in the browser, and imports
// `server-only`.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
if (!supabaseAnonKey) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_ANON_KEY");

export const supabaseClient = createClient<Database>(supabaseUrl, supabaseAnonKey);
