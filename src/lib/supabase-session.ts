import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";

// The per-request session client: the anon key plus the request's session cookies
// (Phase 7 plan, #12). One client per request, never shared. For Auth calls only; the
// server reads data through the db layer (`CLAUDE.md`, "Supabase").
//
// The variables are read per call, not at import, so a missing one throws inside the
// route's `withErrorHandling` and answers 500 `{ error }`.
export function createSessionClient(cookies: CookieMethodsServer) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return createServerClient<Database>(url, anonKey, { cookies });
}

type CookieSource = { getAll(): { name: string; value: string }[] };

// Reads only. An expired session is still refreshed on the server, and the rotated
// tokens are lost: with no `setAll`, `@supabase/ssr` only logs a warning (probed on the
// local stack with a cookie past its `expires_at`, PR #236 round 1; the session still
// worked 11 s later). So use it behind something that refreshes first: the proxy (#223).
export function readOnlyCookies(source: CookieSource): CookieMethodsServer {
  return { getAll: () => source.getAll() };
}

// Reads the request's cookies, and writes what the client sets to `response`, with the
// headers `@supabase/ssr` passes alongside (`Cache-Control: private, no-store, …`). Also
// written to `request`, so a later read by the same client sees them.
export function writingCookies(request: NextRequest, response: NextResponse): CookieMethodsServer {
  return {
    getAll: () => request.cookies.getAll(),
    setAll(cookies, headers) {
      for (const { name, value, options } of cookies) {
        request.cookies.set(name, value);
        response.cookies.set(name, value, options);
      }
      for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
    },
  };
}
