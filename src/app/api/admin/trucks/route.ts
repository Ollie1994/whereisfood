import { NextResponse, type NextRequest } from "next/server";
import { readJson, withAdmin } from "@/lib/http/admin";
import { truckAnswer } from "@/lib/http/trucks";
import { createTruck, listTrucks } from "@/lib/services/trucks";
import { parseNewTruck } from "@/lib/validators/truck";

// Every truck, inactive ones included, by name: the admin's truck list and the location
// form's choices (Phase 7 plan, step 3).
export async function GET(request: NextRequest) {
  return withAdmin(request, async () => NextResponse.json({ trucks: await listTrucks() }));
}

// A new truck: 201 with it, 400 for a bad body, 409 for a handle another truck has.
export async function POST(request: NextRequest) {
  return withAdmin(request, async () => {
    const json = await readJson(request);
    if (!json.ok) return json.response;
    const parsed = parseNewTruck(json.body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    return truckAnswer(await createTruck(parsed.value), 201);
  });
}
