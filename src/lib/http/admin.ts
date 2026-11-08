import { NextResponse, type NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/http/handler";
import { isSameOrigin } from "@/lib/http/origin";
import { requireAdmin, type AdminCheck } from "@/lib/services/admin-auth";
import { createSessionClient, readOnlyCookies } from "@/lib/supabase-session";

// The one way into an admin route (Phase 7 plan, #13): every `route.ts` under
// `src/app/api/admin/` wraps each handler in `withAdmin`, and `admin-auth.test.ts` finds
// them on disk and checks that each refuses.

type Refusal = Extract<AdminCheck, { ok: false }>["reason"];

const REFUSALS: Record<Refusal, { status: number; error: string }> = {
  "no-session": { status: 401, error: "Du är inte inloggad" },
  "not-admin": { status: 403, error: "Du har inte behörighet" },
  // An Auth or database failure isn't "logged out" (#32).
  unavailable: { status: 503, error: "Det gick inte att kontrollera inloggningen just nu" },
};

// `requireAdmin`'s refusal as `{ error }`, for `withAdmin` and for the proxy's answer on
// `/api/admin/*`. `no-store` like every admin answer (#15).
export function adminRefusal(reason: Refusal): NextResponse {
  const { status, error } = REFUSALS[reason];
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

// Reads change nothing, so only writes are checked for `Origin` (#16).
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Wraps `withErrorHandling`, so a throw is a 500 `{ error }`. In order: a write must come
// from this origin (#16), with no network call before it; then `requireAdmin`, with the
// cookies the request carries (the proxy has already refreshed them, #12); then the
// handler, given the admin's id. Every answer, the handler's and a 500 included, is given
// `Cache-Control: no-store` here (#15). When the proxy refreshed the session on the way
// in, the browser gets `@supabase/ssr`'s `private, no-cache, no-store, must-revalidate,
// max-age=0` instead, from the proxy's response (`next start`, the PR for IS #223).
export async function withAdmin(
  request: NextRequest,
  handler: (adminId: string) => Promise<Response>,
): Promise<Response> {
  const response = await withErrorHandling(async () => {
    if (!SAFE_METHODS.has(request.method) && !isSameOrigin(request)) {
      return NextResponse.json({ error: "Otillåten begäran" }, { status: 403 });
    }

    const supabase = createSessionClient(readOnlyCookies(request.cookies));
    const check = await requireAdmin({
      cookieNames: request.cookies.getAll().map(({ name }) => name),
      getUser: () => supabase.auth.getUser(),
    });
    if (!check.ok) return adminRefusal(check.reason);

    // A copy, because a handler's `Response.redirect()` or a fetched `Response` has
    // immutable headers. Made inside `withErrorHandling`, so an answer the constructor
    // refuses (`Response.error()`'s status 0, a RangeError) is a 500 `{ error }`.
    const answer = await handler(check.userId);
    return new Response(answer.body, answer);
  });

  // Every answer here is one this function made, so its headers can be set.
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export type JsonBody = { ok: true; body: unknown } | { ok: false; response: Response };

// The request's body parsed as JSON, or a 400 to return. Every admin handler reads its
// body through this, never `request.json()`, whose throw would be a 500.
export async function readJson(request: Request): Promise<JsonBody> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Begärans innehåll är inte giltig JSON" }, { status: 400 }),
    };
  }
}
