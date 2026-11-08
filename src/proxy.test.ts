import type { CookieMethodsServer } from "@supabase/ssr";
import { AuthRetryableFetchError } from "@supabase/supabase-js";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../next.config";

// The proxy's matcher and its answers, with the session client and the db layer stubbed.
// Real sessions: `tests/integration/admin-auth.test.ts`.
//
// `unstable_doesMiddlewareMatch`: Next 16.4.5's docs (`proxy.md`, "Unit testing") name
// it `unstable_doesProxyMatch`, but `next/experimental/testing/server` exports only the
// old name.
const getUserById = vi.fn();
vi.mock("@/lib/db/users", () => ({ getUserById: (id: string) => getUserById(id) }));

const getUser = vi.fn();
let adapter: CookieMethodsServer | undefined;
vi.mock("@/lib/supabase-session", () => ({
  createSessionClient: (cookies: CookieMethodsServer) => {
    adapter = cookies;
    return { auth: { getUser } };
  },
}));

const { proxy, config } = await import("@/proxy");

const ORIGIN = "http://127.0.0.1:3000";
const ID = "00000000-0000-4000-8000-000000000001";
const SESSION = "sb-127-auth-token=base64-abc";

function request(path: string, cookie = "") {
  const headers: Record<string, string> = { host: "127.0.0.1:3000" };
  if (cookie) headers.cookie = cookie;
  return new NextRequest(`${ORIGIN}${path}`, { headers });
}

// `NextResponse.next()` marks its answer with this header; a redirect or a refusal doesn't.
const forwarded = (response: Response) => response.headers.get("x-middleware-next") === "1";

const fetchSpy = vi.fn(() => Promise.reject(new Error("unexpected network call")));

beforeEach(() => {
  getUser.mockReset();
  getUserById.mockReset();
  fetchSpy.mockClear();
  adapter = undefined;
  vi.stubGlobal("fetch", fetchSpy);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());

describe("the matcher", () => {
  const matches = (url: string) => unstable_doesMiddlewareMatch({ config, nextConfig, url });

  it.each(["/admin", "/admin/login", "/admin/trucks", "/api/admin/trucks", "/api/admin/locations/x/cancel"])(
    "runs on %s",
    (url) => expect(matches(url)).toBe(true),
  );

  // `/api/live`: a cookie written on its answer would stop Vercel caching it (`CLAUDE.md`).
  // `/auth/*` sets its own cookies (plan #28). `/dashboard` is the Owners phase's.
  it.each(["/api/live", "/map", "/", "/auth/callback", "/auth/logout", "/dashboard", "/administrator", "/api/administer"])(
    "doesn't run on %s",
    (url) => expect(matches(url)).toBe(false),
  );
});

describe("proxy with no session cookie", () => {
  it.each([
    ["/admin", "a redirect to the login"],
    ["/admin/trucks", "a redirect to the login"],
  ])("answers %s with %s, and makes no Auth, DB or network call", async (path) => {
    const response = await proxy(request(path, "theme=dark"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/admin/login`);
    expect(getUser).not.toHaveBeenCalled();
    expect(getUserById).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("answers an admin route with 401 { error } and no-store, and makes no Auth, DB or network call", async () => {
    const response = await proxy(request("/api/admin/trucks"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: expect.any(String) });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(getUser).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("lets /admin/login through", async () => {
    const response = await proxy(request("/admin/login"));

    expect(forwarded(response)).toBe(true);
    expect(getUser).not.toHaveBeenCalled();
  });
});

describe("proxy with a session cookie", () => {
  it("forwards an admin", async () => {
    getUser.mockResolvedValue({ data: { user: { id: ID } }, error: null });
    getUserById.mockResolvedValue({ id: ID, is_admin: true, truck_id: null, created_at: "" });

    expect(forwarded(await proxy(request("/admin", SESSION)))).toBe(true);
  });

  it("redirects a non-admin's page to the login, and answers its route 403", async () => {
    getUser.mockResolvedValue({ data: { user: { id: ID } }, error: null });
    getUserById.mockResolvedValue({ id: ID, is_admin: false, truck_id: null, created_at: "" });

    const page = await proxy(request("/admin", SESSION));
    expect(page.headers.get("location")).toBe(`${ORIGIN}/admin/login`);
    expect((await proxy(request("/api/admin/trucks", SESSION))).status).toBe(403);
  });

  it("answers an Auth failure with a Swedish page, not the login, and 503 { error } on a route (plan #32)", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthRetryableFetchError("fetch failed", 0) });

    const page = await proxy(request("/admin", SESSION));
    expect(page.status).toBe(503);
    expect(page.headers.get("location")).toBeNull();
    expect(await page.text()).toContain("Det gick inte att kontrollera inloggningen");

    const route = await proxy(request("/api/admin/trucks", SESSION));
    expect(route.status).toBe(503);
    expect(await route.json()).toEqual({ error: expect.any(String) });
  });

  it("answers a database failure the same way", async () => {
    getUser.mockResolvedValue({ data: { user: { id: ID } }, error: null });
    getUserById.mockRejectedValue(new Error("connection refused"));

    expect((await proxy(request("/admin", SESSION))).status).toBe(503);
    expect((await proxy(request("/api/admin/trucks", SESSION))).status).toBe(503);
  });

  // `getUser` stands in for a refresh: it writes rotated cookies through the adapter, as
  // `@supabase/ssr` does.
  function refreshing(isAdmin: boolean) {
    getUser.mockImplementation(async () => {
      adapter!.setAll!([{ name: "sb-127-auth-token", value: "base64-rotated", options: { path: "/" } }], {
        "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
      });
      return { data: { user: { id: ID } }, error: null };
    });
    getUserById.mockResolvedValue({ id: ID, is_admin: isAdmin, truck_id: null, created_at: "" });
  }

  it("forwards rotated cookies to the route and to the browser (plan #12)", async () => {
    refreshing(true);

    const response = await proxy(request("/admin", SESSION));

    expect(forwarded(response)).toBe(true);
    // What the page or route will read: Next's override of the forwarded request's cookies.
    expect(response.headers.get("x-middleware-request-cookie")).toContain("sb-127-auth-token=base64-rotated");
    expect(response.headers.getSetCookie().join()).toContain("sb-127-auth-token=base64-rotated");
  });

  it("keeps rotated cookies on a refusal", async () => {
    refreshing(false);

    const response = await proxy(request("/api/admin/trucks", SESSION));

    expect(response.status).toBe(403);
    expect(response.headers.getSetCookie().join()).toContain("sb-127-auth-token=base64-rotated");
  });
});

describe("proxy on a throw", () => {
  it("answers an admin route 500 { error }, not Next's error page", async () => {
    // A throw `requireAdmin` doesn't catch: the cookie read, before it runs.
    const broken = request("/api/admin/trucks", SESSION);
    vi.spyOn(broken.cookies, "getAll").mockImplementation(() => {
      throw new Error("cookies unreadable");
    });

    const response = await proxy(broken);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal server error" });
  });
});
