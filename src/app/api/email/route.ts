import { NextResponse, after } from "next/server";
import { withErrorHandling } from "@/lib/http/handler";
import { persistPost, prepareEmailIngest } from "@/lib/services/ingestion";

// HTTP entry for the Mailgun inbound-email lane. HTTP only — HMAC verification,
// recipient parsing, and truck validation all live in the ingestion service.
// Node runtime is required: after(), node:crypto (HMAC), and supabaseAdmin
// (reached via the service) are none of them Edge-safe.
export const runtime = "nodejs";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export function POST(request: Request) {
  // withErrorHandling maps any unexpected throw to a 500 { error }. Expected
  // failures below are RETURNED, so they pass through with their own status.
  return withErrorHandling(() => handleEmail(request));
}

async function handleEmail(request: Request): Promise<Response> {
  const signingKey = process.env.MAILGUN_WEBHOOK_SIGNING_KEY;
  if (!signingKey) {
    // Misconfiguration, not a client error — the endpoint can't verify signatures.
    return errorResponse("Server misconfiguration", 500);
  }

  // Mailgun posts multipart/form-data — parse the form, not JSON.
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse("Invalid form data", 400);
  }

  // Capture ALL text fields, not just the typed five: raw_json is the permanent
  // ML corpus and must preserve the complete Mailgun payload (sender, subject,
  // body-html, Message-Id, stripped-text, …). File/attachment entries are not
  // strings and are skipped — Phase 2 stores text fields only.
  const obj: Record<string, string> = {};
  form.forEach((value, key) => {
    if (typeof value === "string") obj[key] = value;
  });

  const result = await prepareEmailIngest(obj, signingKey);
  if (!result.ok) {
    return errorResponse(result.error, result.status);
  }

  // Return 200 immediately; defer the raw insert to after(). Catch there so a
  // post-response failure is logged rather than becoming an unhandled rejection.
  after(async () => {
    try {
      await persistPost(result.post);
    } catch (err) {
      console.error("[api/email] failed to persist post:", err);
    }
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
