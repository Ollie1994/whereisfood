import type { NextRequest } from "next/server";

// NO `export const runtime` HERE — and none is needed. Next.js 16 rejects route
// segment config in the Proxy file outright ("Route segment config is not allowed
// in Proxy file"), failing `next build` while typecheck, lint and tests all pass.
// The export is redundant because the proxy ALWAYS runs on the Node.js runtime in
// Next 16, which is exactly what Supabase auth requires. Issue #50 asked for this
// export to be uncommented; that request predates the Next 16 behaviour and was
// closed as invalid. See https://nextjs.org/docs/messages/middleware-to-proxy
//
// No-op stub. Public-route bypass, X-Make-Secret verification, session auth, and
// Upstash rate limiting all land in Phase 7 — the matcher below is already scoped.
export function proxy(request: NextRequest) {}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/admin/:path*',
    '/api/ingest',
    '/api/email',
    '/api/locations',
  ],
}
