import { unstable_getResponseFromNextConfig } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";
import { STATIC_HEADERS, isAdminPagePath } from "./src/lib/http/csp";

// Which paths `next.config.ts`'s `headers()` gives what (IS #387), through Next's own
// matching of each `source`. The served answers: `scripts/smoke.mjs`.
const answer = (path: string) =>
  unstable_getResponseFromNextConfig({ url: `http://127.0.0.1:3000${path}`, nextConfig });

describe("next.config.ts's headers", () => {
  const every = [
    "/",
    "/map",
    "/api/live",
    "/api/admin/trucks",
    "/auth/callback",
    "/admin",
    "/admin/",
    "/admin/login",
    "/admin/mfa",
    "/admin/trucks",
    "/maplibre/6.11.2/maplibre-gl-worker.mjs",
  ];

  it.each(every)("gives %s every static header", async (path) => {
    const headers = (await answer(path)).headers;
    for (const { key, value } of STATIC_HEADERS) expect(headers.get(key), key).toBe(value);
  });

  // `/admin`'s CSP is the proxy's; a second one here would make two.
  it.each(["/admin", "/admin/", "/admin/login", "/admin/mfa", "/admin/trucks"])("gives %s no CSP", async (path) => {
    expect((await answer(path)).headers.get("content-security-policy")).toBeNull();
  });

  // The proxy sets none on these: its matcher leaves out all but `/api/admin/…`, whose JSON
  // it answers without one (`proxy.test.ts`). So this is their only CSP. Not here: a case
  // variant such as `/Admin/login`, which `caseSensitiveRoutes` gives the static CSP under
  // `next start`: Next's helper throws on one (the agreement test below), so `smoke.mjs` reads
  // it served.
  it.each([
    "/",
    "/map",
    "/api/live",
    "/api/admin/trucks",
    "/auth/callback",
    "/administrator",
    "/maplibre/6.11.2/maplibre-gl-worker.mjs",
  ])(
    "gives %s the static CSP",
    async (path) => {
      const csp = (await answer(path)).headers.get("content-security-policy");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).not.toContain("'nonce-");
    },
  );
});

// `NOT_ADMIN` and the proxy's `isAdminPagePath` must agree, or a path gets two CSPs or none:
// the static CSP exactly where the predicate is false, on the path the proxy reads. Not
// `/admin.rsc` or `/_next/data/<id>/admin.json`: a server hands the proxy those as `/admin`,
// so they get both CSPs, a limit (`next.config.ts`), which this helper can't show. Nor a
// case variant (`/Admin/login`): the helper throws on one ("extracting params from path failed"),
// so the proxy's side is `proxy.test.ts`'s and Vercel's the preview's (IS #414).
describe("NOT_ADMIN and isAdminPagePath", () => {
  it.each([
    "/admin",
    "/admin/",
    "/admin/login",
    "/admin/trucks/x",
    "/admin.json",
    "/%61dmin/login",
    "/administrator",
    "/api/admin/trucks",
    "/map",
  ])("agree on %s", async (path) => {
    const hasStatic = (await answer(path)).headers.get("content-security-policy") !== null;
    expect(hasStatic).toBe(!isAdminPagePath(path));
  });
});
