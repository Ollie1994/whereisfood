import { NextResponse } from "next/server";
import type { EntryResult, Refusal } from "@/lib/services/locations";

// The location routes' answers: the service's reasons as statuses (`project-context.md`,
// "Status codes"). Expected refusals are returned, never thrown (`CLAUDE.md`, "API
// responses"). The path id is `id.ts`'s.

const STATUS: Record<Refusal["reason"], number> = { invalid: 400, "not-found": 404, conflict: 409 };

export function entryAnswer(result: EntryResult, status = 200): Response {
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: STATUS[result.reason] });
  return NextResponse.json({ entry: result.entry }, { status });
}
