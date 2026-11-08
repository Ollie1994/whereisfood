import { NextResponse, type NextRequest } from "next/server";
import { withAdmin } from "@/lib/http/admin";
import { listTrucks } from "@/lib/services/trucks";

// Every truck, inactive ones included, by name: the admin's truck list and the location
// form's choices (Phase 7 plan, step 3).
export async function GET(request: NextRequest) {
  return withAdmin(request, async () => NextResponse.json({ trucks: await listTrucks() }));
}
