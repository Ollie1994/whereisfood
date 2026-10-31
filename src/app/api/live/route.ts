import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/http/handler";
import { getLiveMap } from "@/lib/services/live";

// The public read path (`CLAUDE.md`, "`/api/live`"). An ordinary dynamic route (`next
// build` lists it as ƒ): no route segment config and never ISR, so the CDN copy comes
// from this header. Nothing here sets a cookie, `Vary: Cookie`, `private` or `no-store`,
// any of which stops Vercel caching it (`CLAUDE.md`). An error goes through
// `withErrorHandling` to a 500, never an empty 200, which would be cached and wipe the map.
const CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=60";

export async function GET() {
  return withErrorHandling(async () =>
    NextResponse.json(await getLiveMap(), { headers: { "Cache-Control": CACHE_CONTROL } }),
  );
}
