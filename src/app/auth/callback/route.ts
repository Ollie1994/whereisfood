import type { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/http/handler";
import { redirectTo } from "@/lib/http/origin";
import { callbackErrorFor, type CallbackError } from "@/lib/login";
import { createSessionClient, writingCookies } from "@/lib/supabase-session";

// Finishes a magic-link login. Auth's `/verify` answers 303 here with `?code=…`, or with
// `?error=access_denied&error_code=otp_expired…` for a used or superseded link (probed on
// the local stack, PR for IS #222). The code is exchanged with the PKCE verifier the
// login page left in a cookie, which writes the session cookies onto the redirect.
//
// Outside the proxy and `/api/admin/` (Phase 7 plan, #28), so it sets its own cookies.
export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const failed = (reason: CallbackError) => redirectTo(`/admin/login?error=${reason}`, 303);

    const code = request.nextUrl.searchParams.get("code");
    if (!code) return failed("link");

    const response = redirectTo("/admin", 303);
    const supabase = createSessionClient(writingCookies(request, response));
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return failed(callbackErrorFor(error));

    return response;
  });
}
