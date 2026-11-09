import { NextResponse, type NextRequest } from "next/server";
import { readJson, withAdmin } from "@/lib/http/admin";
import { entryAnswer, entryId, type IdContext } from "@/lib/http/entries";
import { editEntry } from "@/lib/services/locations";
import { parseLocationPatch } from "@/lib/validators/location";

// An edit of a live entry's place, label or times: 400 for a bad id or body, 404 for a
// missing or cancelled entry, 409 for an overlap. No DELETE, ever (`CLAUDE.md`,
// "Locations").
export async function PATCH(request: NextRequest, context: IdContext) {
  return withAdmin(request, async () => {
    const id = await entryId(context);
    if (!id.ok) return id.response;
    const json = await readJson(request);
    if (!json.ok) return json.response;
    const parsed = parseLocationPatch(json.body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    return entryAnswer(await editEntry(id.id, parsed.value, new Date()));
  });
}
