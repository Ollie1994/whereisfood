import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { NextRequest, type NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Auth errors the local stack can't produce on demand, stubbed (plan step 2's Files).
// The integration test (`tests/integration/auth-routes.test.ts`) covers real sessions.
const signOut = vi.fn();
// The request and response the route handed to `writingCookies`, so a stub can write to
// both as the real adapter's `setAll` does.
let adapted: { request: NextRequest; response: NextResponse } | undefined;
vi.mock("@/lib/supabase-session", () => ({
  createSessionClient: () => ({ auth: { signOut } }),
  writingCookies: (request: NextRequest, response: NextResponse) => {
    adapted = { request, response };
    return { getAll: () => [] };
  },
}));

const { POST } = await import("@/app/auth/logout/route");

const ORIGIN = "http://127.0.0.1:3000";

function logoutRequest(headers: Record<string, string> = { origin: ORIGIN }) {
  return new NextRequest(`${ORIGIN}/auth/logout`, {
    method: "POST",
    headers: {
      host: "127.0.0.1:3000",
      cookie: "sb-127-auth-token=base64-abc; sb-127-auth-token-code-verifier=base64-def; theme=dark",
      ...headers,
    },
  });
}

// The `Set-Cookie` lines that clear a cookie, by name.
function cleared(response: Response): string[] {
  return response.headers
    .getSetCookie()
    .filter((line) => /expires=Thu, 01 Jan 1970/i.test(line) && /path=\//i.test(line))
    .map((line) => line.split("=")[0]);
}

beforeEach(() => {
  signOut.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /auth/logout", () => {
  // A failed global sign-out lands on the login with `?error=logout`, whose text says other
  // devices may still be signed in (`LOGOUT_FAILED_PATH`). An error that says this session is
  // already gone (`isInvalidSession`) isn't a failure: the owner's call (IS #385).
  it.each([
    ["no error", "/admin/login", () => signOut.mockResolvedValue({ error: null })],
    ["a session already gone, its refresh refused", "/admin/login", () =>
      signOut.mockResolvedValue({ error: new AuthApiError("Invalid Refresh Token: Refresh Token Not Found", 400, "refresh_token_not_found") })],
    ["a 500 from Auth, which _signOut answers without removing the session", "/admin/login?error=logout", () =>
      signOut.mockResolvedValue({ error: new AuthApiError("boom", 500, "unexpected_failure") })],
    ["a failed fetch", "/admin/login?error=logout", () => signOut.mockResolvedValue({ error: new AuthRetryableFetchError("fetch failed", 0) })],
    ["a throw", "/admin/login?error=logout", () => signOut.mockRejectedValue(new Error("network down"))],
  ])("clears every sb-* cookie and answers 303, on %s, to %s", async (_, location, stub) => {
    stub();
    const response = await POST(logoutRequest());

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(location);
    expect(cleared(response).sort()).toEqual(["sb-127-auth-token", "sb-127-auth-token-code-verifier"]);
    expect(signOut).toHaveBeenCalledExactlyOnceWith({ scope: "global" });
  });

  it("also clears a cookie a refresh wrote under a new name before Auth failed", async () => {
    signOut.mockImplementation(async () => {
      adapted?.request.cookies.set("sb-127-auth-token.0", "base64-refreshed");
      adapted?.response.cookies.set("sb-127-auth-token.0", "base64-refreshed", { path: "/", maxAge: 34560000 });
      return { error: { status: 500, name: "AuthApiError", message: "boom" } };
    });
    const response = await POST(logoutRequest());
    expect(cleared(response).sort()).toEqual([
      "sb-127-auth-token",
      "sb-127-auth-token-code-verifier",
      "sb-127-auth-token.0",
    ]);
    // The delete replaced the refresh's own `Set-Cookie` for that name.
    expect(response.headers.getSetCookie().filter((line) => line.includes("base64-refreshed"))).toEqual([]);
  });

  it("leaves cookies that aren't Supabase's alone", async () => {
    signOut.mockResolvedValue({ error: null });
    const response = await POST(logoutRequest());
    expect(cleared(response)).not.toContain("theme");
  });

  it.each([
    ["a foreign Origin", { origin: "https://evil.example" }],
    ["no Origin", {}],
  ])("refuses %s with 403, clears nothing and never calls Auth", async (_, headers) => {
    const response = await POST(logoutRequest(headers));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Otillåten begäran" });
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(signOut).not.toHaveBeenCalled();
  });
});

// A client can set `X-Forwarded-Host`, and a matching `Origin` with it; the redirect must
// not name that host (`origin.ts`, `redirectTo`), on success or on a failed sign-out.
it.each([
  ["a sign-out", { error: null }, "/admin/login"],
  ["a failed sign-out", { error: new AuthApiError("boom", 500, "unexpected_failure") }, "/admin/login?error=logout"],
])("redirects %s to a relative path whatever X-Forwarded-Host says", async (_, answer, location) => {
  signOut.mockResolvedValue(answer);
  const response = await POST(
    logoutRequest({ origin: "https://evil.example", "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" }),
  );

  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(location);
});
