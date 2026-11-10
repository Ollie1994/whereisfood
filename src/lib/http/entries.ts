import { NextResponse } from "next/server";
import { ENTRY_ERRORS, type EntryResult, type Refusal } from "@/lib/services/locations";
import type { Location } from "@/lib/types";

// The location routes' answers: the service's reasons as statuses (`project-context.md`,
// "Status codes"). Expected refusals are returned, never thrown (`CLAUDE.md`, "API
// responses"). The path id is `id.ts`'s.

const STATUS: Record<Refusal["reason"], number> = { invalid: 400, "not-found": 404, conflict: 409 };

export function entryAnswer(result: EntryResult, status = 200): Response {
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: STATUS[result.reason] });
  return NextResponse.json({ entry: result.entry }, { status });
}

// Cancel and confirm: the entry, or 404 for a missing or cancelled one.
export function entryOrNotFound(entry: Location | null): Response {
  if (!entry) return NextResponse.json({ error: ENTRY_ERRORS.notFound }, { status: 404 });
  return NextResponse.json({ entry });
}
