import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/http/handler";
import { getLiveMap } from "@/lib/services/live";

// The public read path (`CLAUDE.md`, "`/api/live`"). An ordinary dynamic route: no route
// segment config and never ISR; Vercel's CDN caches it from this header alone. Nothing
// here sets a cookie, `Vary: Cookie`, `private` or `no-store`, any of which stops that.
// An error throws through `withErrorHandling` to a 500, which the CDN doesn't cache;
// an empty 200 would be cached and wipe the map.
const CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=60";

export async function GET() {
  return withErrorHandling(async () =>
    NextResponse.json(await getLiveMap(), { headers: { "Cache-Control": CACHE_CONTROL } }),
  );
}
