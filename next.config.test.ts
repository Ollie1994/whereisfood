import { unstable_getResponseFromNextConfig } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";
import { STATIC_HEADERS } from "./src/lib/http/csp";

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
  // variant such as `/Admin/login`, which `caseSensitiveRoutes` gives the static CSP. Next's
  // helper builds each route without that flag (`config-testing-utils.js`), so `smoke.mjs`
  // reads it served.
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
