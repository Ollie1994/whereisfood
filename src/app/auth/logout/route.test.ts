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
  it.each([
    ["no error", () => signOut.mockResolvedValue({ error: null })],
    ["a 500 from Auth, which _signOut answers without removing the session", () =>
      signOut.mockResolvedValue({ error: { status: 500, name: "AuthApiError", message: "boom" } })],
    ["a throw", () => signOut.mockRejectedValue(new Error("network down"))],
  ])("clears every sb-* cookie and answers 303 to the login, on %s", async (_, stub) => {
    stub();
    const response = await POST(logoutRequest());

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin/login");
    expect(cleared(response).sort()).toEqual(["sb-127-auth-token", "sb-127-auth-token-code-verifier"]);
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
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
// not name that host (`origin.ts`, `redirectTo`).
it("redirects to a relative path whatever X-Forwarded-Host says", async () => {
  signOut.mockResolvedValue({ error: null });
  const response = await POST(
    logoutRequest({ origin: "https://evil.example", "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" }),
  );

  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("/admin/login");
});
