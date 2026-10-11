import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// Two Supabase clients with different permission levels.
//
// Today the env boundary is the only guard: SUPABASE_SERVICE_ROLE_KEY has no
// NEXT_PUBLIC_ prefix, so Next.js never inlines it into the client bundle — it is
// undefined in the browser. `supabaseAdmin` must therefore only ever be imported
// from server code (the db layer and the integration test helpers). There is no
// `import 'server-only'` guard and no client code imports this module today. That
// changes at the Phase 7 login screen: a client component importing `supabaseClient`
// would evaluate this whole module in the browser and throw on the missing
// service-role key, so the file is split then (project-context, "Admin and auth").

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
if (!supabaseAnonKey) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_ANON_KEY");
if (!supabaseServiceRoleKey) throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY");

// Server only — bypasses RLS via the service role. Imported by the db layer
// (`src/lib/db/`) and the integration test helpers; routes and services reach the
// database through the db layer, never this client directly. Never import this into a
// client component.
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

// Browser safe — respects RLS via the anon key. Unused today; in the target design
// the browser uses it for Auth only (admin login, Phase 7), never to read data.
export const supabaseClient = createClient<Database>(supabaseUrl, supabaseAnonKey);
