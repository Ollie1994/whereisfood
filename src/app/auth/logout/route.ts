import type { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/http/handler";
import { foreignOriginRefusal, isSameOrigin, redirectTo } from "@/lib/http/origin";
import { isInvalidSession } from "@/lib/auth-errors";
import { LOGOUT_FAILED_PATH } from "@/lib/login";
import { createSessionClient, writingCookies } from "@/lib/supabase-session";

// Ends every session of the signed-in user: `LogoutButton`'s form POST. No admin check, so
// a non-admin or an expired session can clear its cookies too (Phase 7 plan, #28).
//
// `scope: "global"`: logging out on one device logs out the others too, so a session
// someone made separately dies with any logout (Phase 9 plan, #5). Then every `sb-*` cookie
// is deleted here whatever Auth answered: `_signOut` (`@supabase/auth-js` 2.106.2,
// `dist/main`) returns without removing the session on a session error, and on an Auth
// error other than 401, 403 or 404. Its test stubs both. When it threw, or answered an error
// that doesn't say the session is gone (`isInvalidSession`), the login says other devices may
// still be signed in (`LOGOUT_FAILED_PATH`; the owner's call, IS #385).
//
// A limit: a logout from a session Auth no longer holds ends no other session and reads as
// success. `_signOut` makes no call with no session and answers no error for `/logout`'s 401,
// 403 or 404; a refresh that fails on the dead session (`refresh_token_not_found`) is an
// `isInvalidSession` error, read the same way. A session the app refused (the time-box, a
// first factor outside the allowlist) is signed out and sent to the login, where no logout
// button shows.
//
// 303, not 307 (`NextResponse.redirect`'s default): the browser follows a 303 with a GET,
// and a 307 would re-POST to the login page (#28).
export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    if (!isSameOrigin(request)) return foreignOriginRefusal();

    const response = redirectTo("/admin/login", 303);

    // Outside the `try`: a missing variable is a 500 from `withErrorHandling`, as
    // `createSessionClient` says, not a logout that never reached Auth.
    const supabase = createSessionClient(writingCookies(request, response));
    let failed = false;
    try {
      const { error } = await supabase.auth.signOut({ scope: "global" });
      if (error) {
        failed = !isInvalidSession(error);
        console.error("[auth/logout] signOut answered with an error:", error);
      }
    } catch (err) {
      failed = true;
      console.error("[auth/logout] signOut threw:", err);
    }
    if (failed) response.headers.set("Location", LOGOUT_FAILED_PATH);

    // Listed after `signOut`: `writingCookies` also writes to `request`, so a cookie a
    // refresh wrote under a new name (another chunk) is deleted too.
    for (const { name } of request.cookies.getAll()) {
      if (name.startsWith("sb-")) response.cookies.delete(name);
    }
    return response;
  });
}
