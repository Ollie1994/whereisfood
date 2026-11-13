import { NextResponse, type NextRequest } from "next/server";
import { readJson, withAdmin } from "@/lib/http/admin";
import { type IdContext, pathId } from "@/lib/http/id";
import { truckAnswer } from "@/lib/http/trucks";
import { editTruck } from "@/lib/services/trucks";
import { parseTruckPatch } from "@/lib/validators/truck";

// An edit of a truck, "set inactive" included: 400 for a bad id or body, 404 for a missing
// truck, 409 for a handle another truck has. No DELETE, ever (`CLAUDE.md`, "Locations").
export async function PATCH(request: NextRequest, context: IdContext) {
  return withAdmin(request, async () => {
    const id = await pathId(context);
    if (!id.ok) return id.response;
    const json = await readJson(request);
    if (!json.ok) return json.response;
    const parsed = parseTruckPatch(json.body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    return truckAnswer(await editTruck(id.id, parsed.value));
  });
}

// Probe for IS #285: params not a Promise, which only Next's generated route types reject. Never merged.

export async function GET(_request: NextRequest, _context: { params: { id: string } }) { return new Response(null); }
