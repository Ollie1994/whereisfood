import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Auth's answers to the exchange, stubbed: an outage can't be produced on the local stack
// on demand. The integration test (`tests/integration/auth-routes.test.ts`) covers a real
// emailed link.
const exchangeCodeForSession = vi.fn();
vi.mock("@/lib/supabase-session", () => ({
  createSessionClient: () => ({ auth: { exchangeCodeForSession } }),
  writingCookies: () => ({ getAll: () => [] }),
}));

const { GET } = await import("@/app/auth/callback/route");

const ORIGIN = "http://127.0.0.1:3000";

function callback(query: string) {
  return GET(new NextRequest(`${ORIGIN}/auth/callback${query}`, { headers: { host: "127.0.0.1:3000" } }));
}

beforeEach(() => exchangeCodeForSession.mockReset());

describe("GET /auth/callback", () => {
  it("lands on /admin when the exchange succeeds", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
    const response = await callback("?code=abc");

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin");
    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
  });

  it.each([
    ["a failed fetch", new AuthRetryableFetchError("network down", 0)],
    ["a 503", new AuthRetryableFetchError("unavailable", 503)],
    ["a 500", new AuthApiError("boom", 500, "unexpected_failure")],
  ])("sends %s to the login with ?error=unavailable, not ?error=link", async (_, error) => {
    exchangeCodeForSession.mockResolvedValue({ data: {}, error });
    const response = await callback("?code=abc");

    expect(response.headers.get("location")).toBe("/admin/login?error=unavailable");
  });

  it("sends a refused code to the login with ?error=link", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: {}, error: new AuthApiError("used", 400, "validation_failed") });
    const response = await callback("?code=abc");

    expect(response.headers.get("location")).toBe("/admin/login?error=link");
  });

  it("sends no code to the login with ?error=link without calling Auth", async () => {
    const response = await callback("");

    expect(response.headers.get("location")).toBe("/admin/login?error=link");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });
});

// A client can set `X-Forwarded-Host`; the redirect must not name its host. Under `next
// start`, one built from `requestOrigin` named `evil.example` (`origin.ts`, `redirectTo`).
it("redirects to a relative path whatever X-Forwarded-Host says", async () => {
  exchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
  const response = await GET(
    new NextRequest(`${ORIGIN}/auth/callback?code=abc`, {
      headers: { host: "127.0.0.1:3000", "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" },
    }),
  );

  expect(response.headers.get("location")).toBe("/admin");
});
