import { NextResponse, type NextRequest } from "next/server";
import { withAdmin } from "@/lib/http/admin";
import { getRecentPlaces } from "@/lib/services/locations";
import { LOCATION_ERRORS } from "@/lib/validators/location";
import { isUuid } from "@/lib/validators/uuid";

// A truck's recent places, for the place picker (Phase 7 plan, step 9): `?truckId=`, 400
// unless it is a uuid, which would otherwise reach Postgres as `22P02`, a 500.
export async function GET(request: NextRequest) {
  return withAdmin(request, async () => {
    const truckId = request.nextUrl.searchParams.get("truckId");
    if (truckId === null || !isUuid(truckId)) {
      return NextResponse.json({ error: LOCATION_ERRORS.truck }, { status: 400 });
    }
    return NextResponse.json({ places: await getRecentPlaces(truckId, new Date()) });
  });
}
