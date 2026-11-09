import type { NextRequest } from "next/server";
import { withAdmin } from "@/lib/http/admin";
import { entryId, entryOrNotFound, type IdContext } from "@/lib/http/entries";
import { confirmEntry } from "@/lib/services/locations";

// "Stämmer fortfarande": moves the entry's `updated_at` (Phase 7 plan, #18), so the popup's
// "Uppdaterad" follows. 404 for a missing or cancelled entry. No body.
export async function POST(request: NextRequest, context: IdContext) {
  return withAdmin(request, async () => {
    const id = await entryId(context);
    if (!id.ok) return id.response;
    return entryOrNotFound(await confirmEntry(id.id, new Date()));
  });
}
