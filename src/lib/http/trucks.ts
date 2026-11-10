import { NextResponse } from "next/server";
import type { TruckRefusal, TruckResult } from "@/lib/services/trucks";

// The truck routes' answers: the service's reasons as statuses (`project-context.md`,
// "Status codes"). Expected refusals are returned, never thrown (`CLAUDE.md`, "API
// responses"). A path id is checked by `entries.ts`'s `entryId`, shared with the location
// routes.

const STATUS: Record<TruckRefusal["reason"], number> = { "not-found": 404, conflict: 409 };

export function truckAnswer(result: TruckResult, status = 200): Response {
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: STATUS[result.reason] });
  return NextResponse.json({ truck: result.truck }, { status });
}
