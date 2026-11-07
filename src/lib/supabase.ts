import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// The service-role client. Server only: imported by the db layer (`src/lib/db/`) and
// the integration tests; routes and services reach the database through the db layer,
// never this client directly (`CLAUDE.md`, "Supabase"). The browser's Auth client is
// `src/lib/supabase-browser.ts`.
//
// `import "server-only"` fails `next build` when a client component imports this
// module, directly or through another module (the PR for IS #221 records the build's
// error).

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
if (!supabaseServiceRoleKey) throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY");

// Bypasses RLS through the service role.
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
