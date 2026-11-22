import { NextResponse, type NextRequest } from "next/server";
import { readJson, withAdmin } from "@/lib/http/admin";
import { entryAnswer } from "@/lib/http/entries";
import { createEntry, listAdminEntries } from "@/lib/services/locations";
import { parseNewLocation } from "@/lib/validators/location";

// The admin's entries from the start of today for 14 days, with truck names (Phase 7 plan,
// #24); uncached, like every admin answer (#15).
export async function GET(request: NextRequest) {
  return withAdmin(request, async () => NextResponse.json({ entries: await listAdminEntries(new Date()) }));
}

// A new entry: 201 with it, 400 for a bad body, an inactive truck or a time already
// passed, 409 for an overlap.
export async function POST(request: NextRequest) {
  return withAdmin(request, async (adminId) => {
    const json = await readJson(request);
    if (!json.ok) return json.response;
    const parsed = parseNewLocation(json.body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    return entryAnswer(await createEntry(parsed.value, adminId, new Date()), 201);
  });
}
