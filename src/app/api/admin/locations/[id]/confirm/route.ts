import type { NextRequest } from "next/server";
import { withAdmin } from "@/lib/http/admin";
import { entryAnswer } from "@/lib/http/entries";
import { type IdContext, pathId } from "@/lib/http/id";
import { confirmEntry } from "@/lib/services/locations";

// "Stämmer fortfarande": moves the entry's `updated_at` (Phase 7 plan, #18), so the popup's
// "Uppdaterad" follows. 404 for a missing or cancelled entry; 400 for one that has ended
// (Phase 9 plan #8). No body.
export async function POST(request: NextRequest, context: IdContext) {
  return withAdmin(request, async () => {
    const id = await pathId(context);
    if (!id.ok) return id.response;
    return entryAnswer(await confirmEntry(id.id, new Date()));
  });
}
