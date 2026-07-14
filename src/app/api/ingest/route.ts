import { timingSafeEqual } from "node:crypto";
import { NextResponse, after } from "next/server";
import { persistPost, prepareWebhookIngest } from "@/lib/services/ingestion";

// HTTP entry for the Make.com webhook lane. HTTP only — all business logic lives
// in the ingestion service. Node runtime is required: after(), node:crypto, and
// supabaseAdmin (reached via the service) are none of them Edge-safe.
export const runtime = "nodejs";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

// Constant-time string comparison with a length guard, so a wrong secret can't be
// distinguished from a correct one by timing and timingSafeEqual never throws.
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const expectedSecret = process.env.MAKE_WEBHOOK_SECRET;
  if (!expectedSecret) {
    // Misconfiguration, not a client error — the endpoint can't authenticate.
    return errorResponse("Server misconfiguration", 500);
  }

  // X-Make-Secret proves the request came from Make.com. It does NOT prove the
  // truck_id is legitimate — prepareWebhookIngest validates that separately.
  const provided = request.headers.get("x-make-secret");
  if (!provided || !secretMatches(provided, expectedSecret)) {
    return errorResponse("Unauthorized", 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const result = await prepareWebhookIngest(body);
  if (!result.ok) {
    return errorResponse(result.error, result.status);
  }

  // Return 200 immediately; defer the raw insert to after(). Catch here so a
  // post-response failure is logged rather than becoming an unhandled rejection
  // (Make.com won't retry — accepted in Phase 2, per the plan).
  after(async () => {
    try {
      await persistPost(result.post);
    } catch (err) {
      console.error("[api/ingest] failed to persist post:", err);
    }
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
