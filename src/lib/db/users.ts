import { supabaseAdmin } from "@/lib/supabase";
import type { User } from "@/lib/types";

// DB access only: no business logic, errors propagate unchanged (`CLAUDE.md`, "db
// layer"). `is_admin` is read here, never through the session client (Phase 7 plan, #14).

// Every column of `users`, named. ONE STRING LITERAL, so supabase-js infers the row type
// and `tsc` fails if a column of `User` is missing; `db-users.test.ts`'s key-set test
// catches an extra one (issue #48).
const USER_COLUMNS = "id, truck_id, is_admin, created_at";

// The `users` row of this auth user, or null when it has none: an auth user can exist
// without one (`createFixtureAuthUser` in `tests/integration/helpers.ts`). An id that
// isn't a uuid raises `22P02`; the callers pass ids Auth verified.
export async function getUserById(id: string): Promise<User | null> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select(USER_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}
