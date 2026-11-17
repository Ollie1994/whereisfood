import type { NextRequest } from "next/server";
import { withAdmin } from "@/lib/http/admin";
import { entryAnswer } from "@/lib/http/entries";
import { type IdContext, pathId } from "@/lib/http/id";
import { cancelEntry } from "@/lib/services/locations";

// Cancels a live entry: it leaves the map and stays in the database. 404 for a missing or
// already-cancelled one, whose first `cancelled_at` stays; 400 for one that has ended (Phase
// 9 plan #8). No body.
export async function POST(request: NextRequest, context: IdContext) {
  return withAdmin(request, async () => {
    const id = await pathId(context);
    if (!id.ok) return id.response;
    return entryAnswer(await cancelEntry(id.id, new Date()));
  });
}
