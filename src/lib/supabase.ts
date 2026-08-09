import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// Two Supabase clients with different permission levels.
//
// Env boundary is the security guard this phase: SUPABASE_SERVICE_ROLE_KEY has no
// NEXT_PUBLIC_ prefix, so Next.js never inlines it into the client bundle — it is
// undefined in the browser. `supabaseAdmin` must therefore only ever be imported
// from server code (API routes, services). No `import 'server-only'` guard yet —
// deferred to Phase 4, when client hooks first import `supabaseClient`.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
if (!supabaseAnonKey) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_ANON_KEY");
if (!supabaseServiceRoleKey) throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY");

// Server only — bypasses RLS via the service role. Used in API routes, services,
// and cron. Never import this into a client component.
export const supabaseAdmin = createClient<Database>(
  supabaseUrl,
  supabaseServiceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

// Browser safe — respects RLS via the anon key. Used in components, hooks, auth,
// and realtime. Created now but unused until Phase 4.
export const supabaseClient = createClient<Database>(supabaseUrl, supabaseAnonKey);
