import { NextResponse, type NextRequest } from "next/server";
import { adminRefusal } from "@/lib/http/admin";
import { SESSION_CHECK_FAILED } from "@/lib/login";
import { requireAdmin } from "@/lib/services/admin-auth";
import { createSessionClient, writingCookies } from "@/lib/supabase-session";

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

// What the session client wrote, onto the answer: the rotated cookies, and the headers
// `@supabase/ssr` sends with them (`Cache-Control`, `Expires`, `Pragma`, its
// `cookies.js`), so neither the forwarded answer nor a refusal drops a refreshed session.
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
    // `writingCookies` writes rotated cookies to `request` and collects them on `written`,
    // across however many `setAll` calls a refresh makes (`@supabase/ssr` 0.10's
    // `cookies.js` has three call sites). The forwarded answer is built after the check,
    // from the updated `request`, so the route or page reads the new cookies, and `carry`
    // hands them to the browser (#12).
    const written = new NextResponse();
    const supabase = createSessionClient(writingCookies(request, written));

    const check = await requireAdmin({
      cookieNames: request.cookies.getAll().map(({ name }) => name),
      getUser: () => supabase.auth.getUser(),
    });
    if (check.ok) return carry(written, NextResponse.next({ request }));

    if (isApi) return carry(written, adminRefusal(check.reason));
    if (check.reason === "unavailable") return carry(written, unavailablePage());
    // A limit: a logged-in non-admin lands on the login with no message, and a new link
    // brings them back here. Sign-ups are off, and until the Owners phase the plan creates
    // only the admin's account, so the admin's own use doesn't reach it (PR for IS #223,
    // round 1).
    //
    // Built from `request.url`, which Next then turns into `Location: /admin/login`: its proxy
    // adapter relativizes a redirect whose host matches `request.url`'s (`next/dist/server/
    // web/adapter.js`). Under `next start` that held with `X-Forwarded-Host: evil.example`.
    // Not `redirectTo`'s relative path, which the adapter parses with `new NextURL(…)`: under
    // `next start` `/admin` answered 500 `TypeError: Invalid URL` (PR for IS #223, round 1).
    return carry(written, NextResponse.redirect(new URL(LOGIN, request.url), 307));
  } catch (err) {
    // `withErrorHandling` doesn't wrap the proxy, so a throw (a missing variable) would
    // otherwise be Next's error page (#32).
    console.error("[proxy] unhandled error:", err);
    if (isApi) {
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }
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
