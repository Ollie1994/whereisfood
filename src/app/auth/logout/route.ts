import { NextResponse, type NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/http/handler";
import { isSameOrigin, requestOrigin } from "@/lib/http/origin";
import { createSessionClient, writingCookies } from "@/lib/supabase-session";

// Ends this device's session: `LogoutButton`'s form POST. No admin check, so a
// non-admin or an expired session can clear its cookies too (Phase 7 plan, #28).
//
// `scope: 'local'` ends only this session, not the admin's other devices (#28). Then
// every `sb-*` cookie is deleted here whatever Auth answered: `_signOut`
// (`@supabase/auth-js` 2.106.2, `dist/main`) returns without removing the session on a
// session error, and on an Auth error other than 401, 403 or 404. Its test stubs both.
//
// 303, not `NextResponse.redirect`'s default 307: the browser follows a 303 with a GET,
// and a 307 would re-POST to the login page (#28).
export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    if (!isSameOrigin(request)) {
      return NextResponse.json({ error: "Otillåten begäran" }, { status: 403 });
    }

    const response = NextResponse.redirect(new URL("/admin/login", requestOrigin(request)), 303);

    try {
      const { error } = await createSessionClient(writingCookies(request, response)).auth.signOut({
        scope: "local",
      });
      if (error) console.error("[auth/logout] signOut answered with an error:", error);
    } catch (err) {
      console.error("[auth/logout] signOut threw:", err);
    }

    // Listed after `signOut`: `writingCookies` also writes to `request`, so a cookie a
    // refresh wrote under a new name (another chunk) is deleted too.
    for (const { name } of request.cookies.getAll()) {
      if (name.startsWith("sb-")) response.cookies.delete(name);
    }
    return response;
  });
}
