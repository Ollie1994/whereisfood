import { NextRequest } from "next/server";

// export const runtime = 'nodejs'

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
