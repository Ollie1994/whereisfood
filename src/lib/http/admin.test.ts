import { NextResponse, NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `withAdmin` and `readJson` with the real session client and `fetch` stubbed, so Auth's
// answers are whatever a test returns, and the db layer stubbed. Auth failures the local
// stack can't produce on demand live here; real sessions are
// `tests/integration/admin-auth.test.ts`'s.
const getUserById = vi.fn();
vi.mock("@/lib/db/users", () => ({ getUserById: (id: string) => getUserById(id) }));

const { readJson, withAdmin } = await import("@/lib/http/admin");

const ORIGIN = "http://127.0.0.1:3000";
const ID = "00000000-0000-4000-8000-000000000001";

// A session cookie in `@supabase/ssr`'s format (`base64-` and the session's JSON, base64url),
// unexpired, so `getUser` asks Auth's `/user` and doesn't refresh first.
function sessionCookie(): string {
  const session = {
    access_token: "header.payload.signature",
    refresh_token: "refresh",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: ID },
  };
  return `sb-127-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
}

function request({ method = "GET", cookie = "", origin = ORIGIN as string | null, body = undefined as string | undefined } = {}) {
  const headers: Record<string, string> = { host: "127.0.0.1:3000" };
  if (cookie) headers.cookie = cookie;
  if (origin) headers.origin = origin;
  return new NextRequest(`${ORIGIN}/api/admin/test`, { method, headers, body });
}

const fetchSpy = vi.fn<typeof fetch>();
const handler = vi.fn(async (adminId: string) => NextResponse.json({ adminId }));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  fetchSpy.mockReset();
  fetchSpy.mockRejectedValue(new Error("unexpected network call"));
  vi.stubGlobal("fetch", fetchSpy);
  getUserById.mockReset();
  handler.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const authAnswers = (response: () => Response) => fetchSpy.mockImplementation(async () => response());
const userJson = () => Response.json({ id: ID, aud: "authenticated" });

describe("withAdmin", () => {
  it("answers 401 with no session cookie, with no network or DB call and no-store", async () => {
    const response = await withAdmin(request(), handler);

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getUserById).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it("hands the handler the admin's id, and adds no-store to its answer", async () => {
    authAnswers(userJson);
    getUserById.mockResolvedValue({ id: ID, is_admin: true, truck_id: null, created_at: "" });

    const response = await withAdmin(request({ cookie: sessionCookie() }), handler);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ adminId: ID });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it.each([
    ["Auth answers 503", () => new Response("down", { status: 503 })],
    ["Auth answers 500", () => Response.json({ code: 500, error_code: "unexpected_failure", msg: "boom" }, { status: 500 })],
  ])("answers 503 { error } when %s (plan #32)", async (_, answer) => {
    authAnswers(answer);

    const response = await withAdmin(request({ cookie: sessionCookie() }), handler);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: expect.any(String) });
    expect(handler).not.toHaveBeenCalled();
  });

  it("answers 503 { error } when the users read throws", async () => {
    authAnswers(userJson);
    getUserById.mockRejectedValue(new Error("connection refused"));

    expect((await withAdmin(request({ cookie: sessionCookie() }), handler)).status).toBe(503);
  });

  it("answers 401 when Auth refuses the token", async () => {
    // The body local Auth sent for a malformed JWT (`curl` of `/auth/v1/user`, PR for IS #223).
    authAnswers(() => Response.json({ code: 403, error_code: "bad_jwt", msg: "invalid JWT" }, { status: 403 }));

    expect((await withAdmin(request({ cookie: sessionCookie() }), handler)).status).toBe(401);
  });

  it.each([
    ["a foreign Origin", "https://evil.example"],
    ["no Origin", null],
    ["Origin null", "null"],
  ])("refuses a write with %s with 403, before any network call", async (_, origin) => {
    const response = await withAdmin(request({ method: "POST", cookie: sessionCookie(), origin }), handler);

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("answers a handler's throw with 500 { error } and no-store", async () => {
    authAnswers(userJson);
    getUserById.mockResolvedValue({ id: ID, is_admin: true, truck_id: null, created_at: "" });

    const response = await withAdmin(request({ cookie: sessionCookie() }), async () => {
      throw new Error("boom");
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal server error" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  // `Response.redirect`'s headers are immutable: setting one on it throws a TypeError.
  it("adds no-store to a handler's answer whose headers are immutable", async () => {
    authAnswers(userJson);
    getUserById.mockResolvedValue({ id: ID, is_admin: true, truck_id: null, created_at: "" });

    const response = await withAdmin(request({ cookie: sessionCookie() }), async () =>
      Response.redirect(`${ORIGIN}/admin`, 303),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/admin`);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("readJson", () => {
  it("returns the parsed body", async () => {
    expect(await readJson(request({ method: "POST", body: '{"a":1}' }))).toEqual({ ok: true, body: { a: 1 } });
  });

  it.each([["not JSON", "{a:"], ["empty", ""]])("answers a body that is %s with 400 and a Swedish message", async (_, body) => {
    const result = await readJson(request({ method: "POST", body }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(400);
    expect(await result.response.json()).toEqual({ error: "Begärans innehåll är inte giltig JSON" });
  });
});
