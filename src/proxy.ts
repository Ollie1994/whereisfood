import type { NextRequest } from "next/server";

// NO `export const runtime` HERE — and none is needed. Next.js 16 rejects route
// segment config in the Proxy file outright ("Route segment config is not allowed
// in Proxy file"), failing `next build` while typecheck, lint and tests all pass.
// The export is redundant because the proxy ALWAYS runs on the Node.js runtime in
// Next 16, which is exactly what Supabase auth requires. Issue #50 asked for this
// export to be uncommented; that request predates the Next 16 behaviour and was
// closed as invalid. See https://nextjs.org/docs/messages/middleware-to-proxy
//
// No-op stub. The admin session check, and the `is_admin` check on top of it
// (logged in is not admin), land in Phase 7.
//
// ⚠ THE MATCHER BELOW IS A PHASE 1 DRAFT, NOT THE PHASE 7 SCOPE. `/api/locations` is
// an exact path, so it misses `/api/locations/:id` (edit, cancel); `/dashboard` is
// the truck-owner dashboard, deferred to the Owners phase, and must not get the
// `is_admin` check. Phase 7 sets the matcher to the admin routes it actually builds.
export function proxy(request: NextRequest) {}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/admin/:path*',
    '/api/locations',
  ],
}
