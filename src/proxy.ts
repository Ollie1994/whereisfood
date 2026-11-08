import { NextResponse, type NextRequest } from "next/server";
import { adminRefusal } from "@/lib/http/admin";
import { foreignOriginRefusal, isSameOrigin, isWrite } from "@/lib/http/origin";
import { LOGOUT_LABEL, LOGOUT_PATH, SESSION_CHECK_FAILED } from "@/lib/login";
import { hasSessionCookie, requireAdmin } from "@/lib/services/admin-auth";
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

// Did the session client write a session, not only delete one? `hasSessionCookie`'s names,
// with a value: `@supabase/ssr` deletes a cookie by writing it empty with `maxAge: 0`.
function wroteSession(from: NextResponse): boolean {
  return hasSessionCookie(from.cookies.getAll().filter(({ value }) => value !== "").map(({ name }) => name));
}

// A page's answer when the session can't be checked: Swedish text, not the login, which
// would send the admin to spend one of the built-in email's few links an hour (#32). With
// `LogoutButton`'s form, so a session stuck as "unavailable" (`admin-auth.ts`'s limit) can
// be cleared here; logging out sends no email (the owner's call, PR for IS #223, round 4).
function unavailablePage(): NextResponse {
  const html = `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>WhereIsFood – admin</title></head><body><p role="alert">${SESSION_CHECK_FAILED}</p><form method="post" action="${LOGOUT_PATH}"><button type="submit">${LOGOUT_LABEL}</button></form></body></html>`;
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
    // A write from another origin is refused before any Auth or database call, as
    // `withAdmin` refuses it (#16). Pages take no writes (#11).
    if (isApi && isWrite(request.method) && !isSameOrigin(request)) return foreignOriginRefusal();

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

    // "Unavailable" isn't logged out (#32), so its answer carries a new session but never
    // a deletion alone. A refresh Auth refused with a 429 or a 500 still deletes the
    // session: auth-js 2.106.2's `_callRefreshToken` calls `_removeSession()` on any error
    // but a retryable one (502–504, 520–530), and `@supabase/ssr` then wrote
    // `sb-127-auth-token=''`, `maxAge=0` through `setAll` (a stubbed `fetch`, PR for IS #223,
    // round 3). A refresh that worked before the database failed is kept.
    if (check.reason === "unavailable") {
      const answer = isApi ? adminRefusal(check.reason) : unavailablePage();
      return wroteSession(written) ? carry(written, answer) : answer;
    }

    if (isApi) return carry(written, adminRefusal(check.reason));
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
    // A limit: the adapter's code skips that rewrite when `next.config.ts` sets
    // `skipProxyUrlNormalize` (`define-env.js` turns it into the env flag the adapter reads)
    // or on edge rendering; then the browser gets `request.url`'s host, `localhost` under
    // `next dev` (`origin.ts`). Neither is set here. Seen under `next start` only: what a
    // Vercel deploy sends wasn't read.
    //
    // 303, not 307: a browser follows a 303 with a GET, where a 307 would repeat a POST's
    // method and body at the login page (as logout's comment says, #28).
    return carry(written, NextResponse.redirect(new URL(LOGIN, request.url), 303));
  } catch (err) {
    // `withErrorHandling` doesn't wrap the proxy, so a throw (a missing variable) would
    // otherwise be Next's error page (#32). A limit: a page then shows the "try again in a
    // moment" page even when the cause is lasting, such as a missing variable; the
    // server's log names it. Its "Logga ut" doesn't help then: `/auth/logout` builds the
    // same session client outside its `try` and answers 500 `{ error }`.
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
