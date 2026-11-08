import { NextResponse, type NextRequest } from "next/server";
import { adminRefusal } from "@/lib/http/admin";
import { requestOrigin } from "@/lib/http/origin";
import { SESSION_CHECK_FAILED } from "@/lib/login";
import { requireAdmin } from "@/lib/services/admin-auth";
import { createSessionClient } from "@/lib/supabase-session";

// NO `export const runtime` HERE — and none is needed. Next.js 16 rejects route
// segment config in the Proxy file outright ("Route segment config is not allowed
// in Proxy file"), failing `next build` while typecheck, lint and tests all pass.
// The export is redundant because the proxy ALWAYS runs on the Node.js runtime in
// Next 16, which is exactly what Supabase auth requires. Issue #50 asked for this
// export to be uncommented; that request predates the Next 16 behaviour and was
// closed as invalid. See https://nextjs.org/docs/messages/middleware-to-proxy
//
// The first filter on the admin pages and routes, not the only one: each admin route
// checks again through `withAdmin` (`project-context.md`, "Admin and auth"). Through the
// db layer it imports `src/lib/supabase.ts`, whose `server-only` import builds and runs
// here: a proxy reading `users` through `supabaseAdmin` answered under both `next build` +
// `next start` and `next dev` (Phase 7 plan, open decision 6, settled in the PR for
// IS #223).
//
// It also refreshes the session, so the pages behind it, which only read cookies, see
// fresh tokens (`readOnlyCookies` in `supabase-session.ts`; plan #12).

const LOGIN = "/admin/login";

// The rotated cookies the session client wrote, and the headers `@supabase/ssr` sent with
// them, onto another answer, so a refusal doesn't drop a refreshed session.
function carry(from: NextResponse, to: NextResponse): NextResponse {
  for (const cookie of from.cookies.getAll()) to.cookies.set(cookie);
  for (const name of ["cache-control", "expires", "pragma"]) {
    const value = from.headers.get(name);
    if (value) to.headers.set(name, value);
  }
  return to;
}

// A page's answer when the session can't be checked: Swedish text, not the login, which
// would send the admin to spend one of the built-in email's few links an hour (#32).
function unavailablePage(): NextResponse {
  const html = `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>WhereIsFood – admin</title></head><body><p role="alert">${SESSION_CHECK_FAILED}</p></body></html>`;
  return new NextResponse(html, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");
  if (pathname === LOGIN) return NextResponse.next();

  try {
    // The adapter writes rotated cookies to the request it forwards, through a new
    // `NextResponse.next({ request })`, and to the response (#12): the route or page
    // then reads them, and so does the browser.
    let response = NextResponse.next({ request });
    const supabase = createSessionClient({
      getAll: () => request.cookies.getAll(),
      setAll(cookies, headers) {
        for (const { name, value } of cookies) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookies) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    });

    const check = await requireAdmin({
      cookieNames: request.cookies.getAll().map(({ name }) => name),
      getUser: () => supabase.auth.getUser(),
    });
    if (check.ok) return response;

    if (isApi) return carry(response, adminRefusal(check.reason));
    if (check.reason === "unavailable") return carry(response, unavailablePage());
    // Not `request.url`, whose host under `next dev` isn't the browser's (`origin.ts`).
    return carry(response, NextResponse.redirect(new URL(LOGIN, requestOrigin(request))));
  } catch (err) {
    // `withErrorHandling` doesn't wrap the proxy, so a throw (a missing variable) would
    // otherwise be Next's error page (#32).
    console.error("[proxy] unhandled error:", err);
    if (isApi) return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    return unavailablePage();
  }
}

// `/admin/:path*` matches `/admin` itself too. `/api/live`, `/map` and `/auth/*` stay
// outside (#10, #28): a cookie written on `/api/live`'s answer would stop Vercel caching
// it (`CLAUDE.md`, "`/api/live`"). `/dashboard` is the Owners phase's and must not get
// the `is_admin` check. `src/proxy.test.ts` pins this list.
export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
