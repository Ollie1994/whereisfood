import { NextResponse, type NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/http/handler";
import { requestOrigin } from "@/lib/http/origin";
import { isTemporaryAuthError } from "@/lib/login";
import { createSessionClient, writingCookies } from "@/lib/supabase-session";

// Finishes a magic-link login. Auth's `/verify` answers 303 here with `?code=…`, or with
// `?error=access_denied&error_code=otp_expired…` for a used or superseded link (probed on
// the local stack, PR for IS #222). The code is exchanged with the PKCE verifier the
// login page left in a cookie, which writes the session cookies onto the redirect.
//
// Outside the proxy and `/api/admin/` (Phase 7 plan, #28), so it sets its own cookies.
export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const origin = requestOrigin(request);
    const failed = (reason: "link" | "unavailable") =>
      NextResponse.redirect(new URL(`/admin/login?error=${reason}`, origin), 303);

    const code = request.nextUrl.searchParams.get("code");
    if (!code) return failed("link");

    const response = NextResponse.redirect(new URL("/admin", origin), 303);
    const supabase = createSessionClient(writingCookies(request, response));
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    // Auth down or failing isn't the link's fault: say so, so the admin doesn't spend one
    // of the built-in email's few sends an hour on a new link (plan #32's reasoning).
    if (error) return failed(isTemporaryAuthError(error) ? "unavailable" : "link");

    return response;
  });
}
