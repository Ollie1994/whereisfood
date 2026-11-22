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

// Reads only. A session the client counts as expired is still refreshed on the server,
// and the rotated tokens are lost. Probed on the local stack with a session whose cookie
// `expires_at` was set in the past, its JWT still valid: each of two `getUser` reads,
// 11 s apart, logged one `@supabase/ssr` warning and still worked. A truly expired JWT, in
// IS #448's probe (GoTrue v2.197.0, `jwt_expiry` 60 s, a page gated with this and
// `requireAdmin` on `next start`): 7 loads up to 193 s after the cookie's refresh token was
// first used and 133 s past its access token's expiry, more than
// `refresh_token_reuse_interval`'s 10 s apart, each refreshed, lost the result and was
// admitted. Auth minted no new token, its active one staying the presented token's child, and
// an admin page through the proxy 3 s and 15 s after such a load stored the refresh. Not run
// on a hosted project (Phase 10 plan step 4b, IS #451). Use it behind something that
// refreshes first: the proxy (`src/proxy.ts`).
// SOFT-LAUNCH GATE (Phase 10 plan #5): but for `MapPage`, the gated `/karta`, which uses it
// with no proxy before it on that probe (Plan A, plan #6). This sentence goes at the full
// launch (the removal list in `src/app/karta/page.tsx`).
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
