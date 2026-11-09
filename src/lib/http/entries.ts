import { NextResponse } from "next/server";
import { ENTRY_ERRORS, type EntryResult, type Refusal } from "@/lib/services/locations";
import type { Location } from "@/lib/types";
import { isUuid } from "@/lib/validators/uuid";

// The location routes' answers: the service's reasons as statuses (`project-context.md`,
// "Status codes"). Expected refusals are returned, never thrown (`CLAUDE.md`, "API
// responses").

const STATUS: Record<Refusal["reason"], number> = { invalid: 400, "not-found": 404, conflict: 409 };

export type IdContext = { params: Promise<{ id: string }> };

// The path's id, or a 400 to return: an id that isn't a uuid would reach Postgres as
// `22P02` (`src/lib/db/locations.ts`), a 500.
export async function entryId(context: IdContext): Promise<{ ok: true; id: string } | { ok: false; response: Response }> {
  const { id } = await context.params;
  if (isUuid(id)) return { ok: true, id };
  return { ok: false, response: NextResponse.json({ error: "Ogiltigt id" }, { status: 400 }) };
}

export function entryAnswer(result: EntryResult, status = 200): Response {
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: STATUS[result.reason] });
  return NextResponse.json({ entry: result.entry }, { status });
}

// Cancel and confirm: the entry, or 404 for a missing or cancelled one.
export function entryOrNotFound(entry: Location | null): Response {
  if (!entry) return NextResponse.json({ error: ENTRY_ERRORS.notFound }, { status: 404 });
  return NextResponse.json({ entry });
}
