import { NextResponse, type NextRequest } from "next/server";
import { withAdmin } from "@/lib/http/admin";
import { getChecklist } from "@/lib/services/checklist";

// The morning checklist (Phase 7 plan, step 11): `{ day, suggestions }`, today's Stockholm
// date and what each active truck did on this weekday recently (`getChecklist`).
export async function GET(request: NextRequest) {
  return withAdmin(request, async () => NextResponse.json(await getChecklist(new Date())));
}
