import type { CookieMethodsServer } from "@supabase/ssr";
import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/supabase-js";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LINK, TOTP, unsignedJwt } from "../tests/jwt";
import nextConfig from "../next.config";

// The proxy's matcher and its answers, with the session client and the db layer stubbed.
// Real sessions: `tests/integration/admin-auth.test.ts`.
//
// `unstable_doesMiddlewareMatch`: Next 16.4.5's docs (`proxy.md`, "Unit testing") name
// it `unstable_doesProxyMatch`, but `next/experimental/testing/server` exports only the
// old name.
const getUserById = vi.fn();
vi.mock("@/lib/db/users", () => ({ getUserById: (id: string) => getUserById(id) }));

const getSession = vi.fn();
const getUser = vi.fn();
const signOut = vi.fn();
let adapter: CookieMethodsServer | undefined;
// The real `writingCookies`, so what a stubbed refresh writes goes through the app's adapter.
vi.mock("@/lib/supabase-session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase-session")>()),
  createSessionClient: (cookies: CookieMethodsServer) => {
    adapter = cookies;
    return { auth: { getSession, getUser, signOut } };
  },
}));

const { proxy, config } = await import("@/proxy");

const ORIGIN = "http://127.0.0.1:3000";
const ID = "00000000-0000-4000-8000-000000000001";
const SESSION = "sb-127-auth-token=base64-abc";
// The proxy's login redirect: built from `request.url`, where `NextRequest` names
// `127.0.0.1` as `localhost`. A real server then makes it relative (`src/proxy.ts`).
const LOGIN_URL = new URL("/admin/login", new NextRequest(ORIGIN).url).href;
const MFA_URL = new URL("/admin/mfa", new NextRequest(ORIGIN).url).href;
const ADMIN_URL = new URL("/admin", new NextRequest(ORIGIN).url).href;

// The session's access token, as `getSession` hands it out (`tests/jwt.ts`). By default an
// `aal2` magic-link session.
const jwt = unsignedJwt;
const withToken = (claims: object) =>
  getSession.mockResolvedValue({ data: { session: { access_token: jwt(claims) } }, error: null });

function request(path: string, cookie = "") {
  const headers: Record<string, string> = { host: "127.0.0.1:3000" };
  if (cookie) headers.cookie = cookie;
  return new NextRequest(`${ORIGIN}${path}`, { headers });
}

// `NextResponse.next()` marks its answer with this header; a redirect or a refusal doesn't.
const forwarded = (response: Response) => response.headers.get("x-middleware-next") === "1";

const fetchSpy = vi.fn(() => Promise.reject(new Error("unexpected network call")));

beforeEach(() => {
  getSession.mockReset();
  withToken({ aal: "aal2", amr: [LINK, TOTP] });
  getUser.mockReset();
  signOut.mockReset();
  signOut.mockResolvedValue({ error: null });
  getUserById.mockReset();
  fetchSpy.mockClear();
  adapter = undefined;
  vi.stubGlobal("fetch", fetchSpy);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());

describe("the matcher", () => {
  const matches = (url: string) => unstable_doesMiddlewareMatch({ config, nextConfig, url });

  it.each(["/admin", "/admin/login", "/admin/mfa", "/admin/trucks", "/api/admin/trucks", "/api/admin/locations/x/cancel"])(
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

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(LOGIN_URL);
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

describe("proxy on a write to an admin route", () => {
  function write(origin: string | null) {
    const headers: Record<string, string> = { host: "127.0.0.1:3000", cookie: SESSION };
    if (origin) headers.origin = origin;
    return new NextRequest(`${ORIGIN}/api/admin/trucks`, { method: "POST", headers, body: "{}" });
  }

  it.each([
    ["a foreign Origin", "https://evil.example"],
    ["no Origin", null],
  ])("refuses one with %s with 403 and no-store, before any Auth, DB or network call (#16)", async (_, origin) => {
    const response = await proxy(write(origin));

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(getUser).not.toHaveBeenCalled();
    expect(getUserById).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("lets a read with a foreign Origin through to the usual check", async () => {
    getUser.mockResolvedValue({ data: { user: { id: ID } }, error: null });
    getUserById.mockResolvedValue({ id: ID, is_admin: true, truck_id: null, created_at: "" });
    const read = new NextRequest(`${ORIGIN}/api/admin/trucks`, {
      headers: { host: "127.0.0.1:3000", cookie: SESSION, origin: "https://evil.example" },
    });

    expect(forwarded(await proxy(read))).toBe(true);
  });

  it("checks one from this origin as usual", async () => {
    getUser.mockResolvedValue({ data: { user: { id: ID } }, error: null });
    getUserById.mockResolvedValue({ id: ID, is_admin: true, truck_id: null, created_at: "" });

    expect(forwarded(await proxy(write(ORIGIN)))).toBe(true);
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
    expect(page.headers.get("location")).toBe(LOGIN_URL);
    expect((await proxy(request("/api/admin/trucks", SESSION))).status).toBe(403);
  });

  it("answers an Auth failure with a Swedish page, not the login, and 503 { error } on a route (plan #32)", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthRetryableFetchError("fetch failed", 0) });

    const page = await proxy(request("/admin", SESSION));
    expect(page.status).toBe(503);
    expect(page.headers.get("location")).toBeNull();
    const html = await page.text();
    expect(html).toContain("Det gick inte att kontrollera inloggningen");
    // A way out for a session stuck as "unavailable": `LogoutButton`'s form.
    expect(html).toContain('<form method="post" action="/auth/logout"><button type="submit">Logga ut</button></form>');

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

  // What `@supabase/ssr` wrote when Auth refused a refresh with a 429 or a 500 (a stubbed
  // `fetch`, `src/proxy.ts`): the session deleted, then the error.
  it.each(["/admin", "/api/admin/trucks"])(
    "answers %s 503 without the deletion a refused refresh wrote, so the session stays (plan #32)",
    async (path) => {
      getUser.mockImplementation(async () => {
        adapter!.setAll!([{ name: "sb-127-auth-token", value: "", options: { path: "/", maxAge: 0 } }], {});
        return { data: { user: null }, error: new AuthApiError("rate limited", 429, "over_request_rate_limit") };
      });

      const response = await proxy(request(path, SESSION));

      expect(response.status).toBe(503);
      expect(response.headers.getSetCookie()).toEqual([]);
    },
  );

  it("keeps a refreshed session on a 503 when the database fails after the refresh", async () => {
    refreshing(true);
    getUserById.mockRejectedValue(new Error("connection refused"));

    const response = await proxy(request("/api/admin/trucks", SESSION));

    expect(response.status).toBe(503);
    expect(response.headers.getSetCookie().join()).toContain("sb-127-auth-token=base64-rotated");
  });

  // `@supabase/ssr` 0.10 calls `setAll` from three places (`cookies.js`), so one refresh can
  // write twice: here a long session in two chunks, then the old unchunked cookie cleared.
  it("keeps every cookie from more than one setAll call", async () => {
    getUser.mockImplementation(async () => {
      adapter!.setAll!(
        [
          { name: "sb-127-auth-token.0", value: "base64-part0", options: { path: "/" } },
          { name: "sb-127-auth-token.1", value: "part1", options: { path: "/" } },
        ],
        {},
      );
      adapter!.setAll!([{ name: "sb-127-auth-token", value: "", options: { path: "/", maxAge: 0 } }], {});
      return { data: { user: { id: ID } }, error: null };
    });
    getUserById.mockResolvedValue({ id: ID, is_admin: true, truck_id: null, created_at: "" });

    const response = await proxy(request("/admin", SESSION));

    const setCookies = response.headers.getSetCookie().map((line) => line.split(";")[0]);
    expect(setCookies).toEqual(
      expect.arrayContaining(["sb-127-auth-token.0=base64-part0", "sb-127-auth-token.1=part1", "sb-127-auth-token="]),
    );
    expect(response.headers.get("x-middleware-request-cookie")).toContain("sb-127-auth-token.1=part1");
  });

  // A client can set `X-Forwarded-Host`; the redirect must not name its host. Built from
  // `request.url`, it names that URL's host, which Next's adapter then makes relative;
  // that last step runs only in a real server (`src/proxy.ts` says where it was seen),
  // not here.
  it("redirects to request.url's host whatever X-Forwarded-Host says", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() });
    const forged = new NextRequest(`${ORIGIN}/admin`, {
      headers: { host: "127.0.0.1:3000", cookie: SESSION, "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" },
    });

    expect((await proxy(forged)).headers.get("location")).toBe(LOGIN_URL);
  });
});

// The MFA step (Phase 9 plan step 5b, open decisions 5 and 6).
describe("proxy and the second factor", () => {
  const admin = () => {
    getUser.mockResolvedValue({ data: { user: { id: ID, factors: [] } }, error: null });
    getUserById.mockResolvedValue({ id: ID, is_admin: true, truck_id: null, created_at: "" });
  };

  it.each(["/admin", "/admin/trucks"])("sends an aal1 admin's %s to /admin/mfa", async (path) => {
    admin();
    withToken({ aal: "aal1", amr: [LINK] });

    const response = await proxy(request(path, SESSION));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(MFA_URL);
  });

  it("answers an aal1 admin's route 401 with its own text, not no-session's", async () => {
    admin();
    withToken({ aal: "aal1", amr: [LINK] });

    const response = await proxy(request("/api/admin/trucks", SESSION));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Ange koden från din autentiseringsapp för att fortsätta" });
  });

  it("lets an aal1 admin through to /admin/mfa", async () => {
    admin();
    withToken({ aal: "aal1", amr: [LINK] });

    expect(forwarded(await proxy(request("/admin/mfa", SESSION)))).toBe(true);
  });

  it("sends an aal2 admin on from /admin/mfa to /admin", async () => {
    admin();

    const response = await proxy(request("/admin/mfa", SESSION));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(ADMIN_URL);
  });

  it("sends /admin/mfa to the login with no session cookie, with no Auth call", async () => {
    const response = await proxy(request("/admin/mfa"));

    expect(response.headers.get("location")).toBe(LOGIN_URL);
    expect(getSession).not.toHaveBeenCalled();
  });

  it("sends a non-admin's /admin/mfa to the login", async () => {
    admin();
    getUserById.mockResolvedValue({ id: ID, is_admin: false, truck_id: null, created_at: "" });
    withToken({ aal: "aal1", amr: [LINK] });

    expect((await proxy(request("/admin/mfa", SESSION))).headers.get("location")).toBe(LOGIN_URL);
  });

  it.each(["/admin/mfa", "/admin"])("signs an otp session out and sends its %s to the login (plan #14)", async (path) => {
    admin();
    withToken({ aal: "aal1", amr: [{ method: "otp", timestamp: 1 }] });

    const response = await proxy(request(path, SESSION));

    expect(response.headers.get("location")).toBe(LOGIN_URL);
    expect(signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
  });

  it("answers /admin/mfa 503 when Auth fails, not the login", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthRetryableFetchError("fetch failed", 0) });

    expect((await proxy(request("/admin/mfa", SESSION))).status).toBe(503);
  });
});

describe("proxy on a throw", () => {
  it("answers an admin route 500 { error } with no-store, not Next's error page", async () => {
    // A throw `requireAdmin` doesn't catch: the cookie read, before it runs.
    const broken = request("/api/admin/trucks", SESSION);
    vi.spyOn(broken.cookies, "getAll").mockImplementation(() => {
      throw new Error("cookies unreadable");
    });

    const response = await proxy(broken);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal server error" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
