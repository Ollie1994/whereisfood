import { randomUUID } from "node:crypto";
import { globSync } from "node:fs";
import { NextResponse, NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readJson, withAdmin } from "@/lib/http/admin";
import { cookieHeader, createFixtureAuthUser, resetTables, sessionFor, sessionUser } from "./helpers";

// Every admin route refuses anyone but the admin (Phase 7 plan, #13). The routes are FOUND
// ON DISK, not listed: a route added under `src/app/api/admin/` is covered with no edit
// here. Each exported method is called as Next would, with a request and its params.
//
// Three sign-ins (`sessionUser` / `sessionFor`), under local Auth's limit (`helpers.ts`,
// `signedInClient`).

const ORIGIN = "http://127.0.0.1:3000";
const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;

type Handler = (request: NextRequest, context: { params: Promise<Record<string, string>> }) => Promise<Response>;

// `src/app/api/admin/trucks/[id]/route.ts` → its import path, and a params object with a
// fresh uuid for each `[segment]`.
const ROUTES = globSync("src/app/api/admin/**/route.ts").map((file) => {
  const path = file.replaceAll("\\", "/");
  const params = Object.fromEntries([...path.matchAll(/\[([^\]]+)\]/g)].map(([, name]) => [name, randomUUID()]));
  return { path, importPath: `@/${path.slice("src/".length, -".ts".length)}`, params };
});

function request(method: string, cookie: string) {
  const headers: Record<string, string> = { host: "127.0.0.1:3000", origin: ORIGIN, "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  const body = method === "GET" || method === "HEAD" ? undefined : "{}";
  return new NextRequest(`${ORIGIN}/api/admin/test`, { method, headers, body });
}

const sessions: Record<string, string> = {};

beforeAll(async () => {
  await resetTables();
  sessions["no session cookie"] = "";
  sessions["a session cookie that isn't a session"] = "sb-127-auth-token=base64-bm90IGEgc2Vzc2lvbg";
  sessions["a non-admin"] = cookieHeader((await sessionUser()).jar);
  sessions["an auth user with no users row"] = cookieHeader((await sessionFor(await createFixtureAuthUser())).jar);
  sessions.admin = cookieHeader((await sessionUser({ isAdmin: true })).jar);
});
afterAll(resetTables);

describe("the admin routes on disk", () => {
  it("finds at least GET /api/admin/trucks, and every route exports a method", async () => {
    expect(ROUTES.map((route) => route.path)).toContain("src/app/api/admin/trucks/route.ts");
    for (const { importPath } of ROUTES) {
      const exports = await import(importPath);
      expect(METHODS.some((method) => typeof exports[method] === "function"), importPath).toBe(true);
    }
  });
});

describe.each(ROUTES)("$path", ({ importPath, params }) => {
  it.each([
    ["no session cookie", 401],
    ["a session cookie that isn't a session", 401],
    ["a non-admin", 403],
    ["an auth user with no users row", 403],
  ])("answers every exported method with %s as %i { error }, no-store", async (who, status) => {
    const exports = (await import(importPath)) as Partial<Record<(typeof METHODS)[number], Handler>>;
    for (const method of METHODS) {
      const handler = exports[method];
      if (!handler) continue;

      const response = await handler(request(method, sessions[who]), { params: Promise.resolve(params) });

      expect(response.status, method).toBe(status);
      expect(response.headers.get("cache-control"), method).toBe("no-store");
      if (method !== "HEAD") expect(await response.json(), method).toEqual({ error: expect.any(String) });
    }
  });
});

// A write behind `withAdmin`. `GET /api/admin/trucks` is the only route so far, so this
// throwaway handler stands in for the writes later steps add (#223's failure modes).
describe("a write through withAdmin, on the admin's session", () => {
  const write = (request: NextRequest) =>
    withAdmin(request, async (adminId) => {
      const json = await readJson(request);
      if (!json.ok) return json.response;
      return NextResponse.json({ adminId, body: json.body });
    });

  function post(origin: string | null, body = '{"a":1}') {
    const headers: Record<string, string> = { host: "127.0.0.1:3000", cookie: sessions.admin };
    if (origin) headers.origin = origin;
    return new NextRequest(`${ORIGIN}/api/admin/test`, { method: "POST", headers, body });
  }

  it("reaches the handler from this origin, with the admin's id", async () => {
    const response = await write(post(ORIGIN));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ adminId: expect.any(String), body: { a: 1 } });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it.each([
    ["a foreign Origin", "https://evil.example"],
    ["no Origin", null],
  ])("refuses %s with 403 { error }", async (_, origin) => {
    const response = await write(post(origin));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: expect.any(String) });
  });

  it("answers a body that isn't JSON with 400 and a Swedish message", async () => {
    const response = await write(post(ORIGIN, "{not json"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Begärans innehåll är inte giltig JSON" });
  });
});
