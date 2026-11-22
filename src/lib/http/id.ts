import { NextResponse } from "next/server";
import { isUuid } from "@/lib/validators/uuid";

// The `[id]` routes' path id, for the location and the truck routes alike.

export type IdContext = { params: Promise<{ id: string }> };

// The path's id, or a 400 to return: an id that isn't a uuid would reach Postgres as
// `22P02` (`src/lib/db/locations.ts`), a 500.
export async function pathId(context: IdContext): Promise<{ ok: true; id: string } | { ok: false; response: Response }> {
  const { id } = await context.params;
  if (isUuid(id)) return { ok: true, id };
  return { ok: false, response: NextResponse.json({ error: "Ogiltigt id" }, { status: 400 }) };
}
