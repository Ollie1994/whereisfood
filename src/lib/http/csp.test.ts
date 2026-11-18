import { describe, expect, it } from "vitest";
import { BASEMAP_ASSETS, buildAdminCsp, buildStaticCsp, isAdminPagePath, type CspEnv } from "./csp";

// A CSP as a map of directive → sources, so a test reads one directive whole.
function directives(csp: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const part of csp.split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (map.has(name)) throw new Error(`${name} twice`);
    map.set(name, sources);
  }
  return map;
}

const PROD: CspEnv = {
  tilesUrl: "https://pub-0.r2.dev/gothenburg.pmtiles",
  supabaseUrl: "https://abc.supabase.co",
  dev: false,
};
const NONCE = "bm9uY2U=";

describe("buildAdminCsp", () => {
  const csp = directives(buildAdminCsp(NONCE, PROD));

  it("admits scripts by the nonce, and what they load (strict-dynamic), with no inline or eval", () => {
    expect(csp.get("script-src")).toEqual(["'self'", `'nonce-${NONCE}'`, "'strict-dynamic'"]);
  });

  it("admits styles by the nonce, with no inline ones", () => {
    expect(csp.get("style-src")).toEqual(["'self'", `'nonce-${NONCE}'`]);
  });

  it("can't be framed", () => {
    expect(csp.get("frame-ancestors")).toEqual(["'none'"]);
  });

  it("connects to Auth, the tiles and the basemap's assets by origin", () => {
    expect(csp.get("connect-src")).toEqual(["'self'", "https://abc.supabase.co", "https://pub-0.r2.dev", BASEMAP_ASSETS]);
  });

  it("closes what no page uses", () => {
    expect(csp.get("default-src")).toEqual(["'self'"]);
    expect(csp.get("object-src")).toEqual(["'none'"]);
    expect(csp.get("base-uri")).toEqual(["'none'"]);
    expect(csp.get("form-action")).toEqual(["'self'"]);
    expect(csp.get("worker-src")).toEqual(["'self'"]);
  });

  it("adds eval and inline styles only under next dev", () => {
    const dev = directives(buildAdminCsp(NONCE, { ...PROD, dev: true }));
    expect(dev.get("script-src")).toContain("'unsafe-eval'");
    expect(dev.get("style-src")).toEqual(["'self'", "'unsafe-inline'"]);
  });

  it("adds no source for a relative tiles URL or a missing one", () => {
    for (const tilesUrl of ["/gothenburg.pmtiles", undefined]) {
      const local = directives(buildAdminCsp(NONCE, { tilesUrl, supabaseUrl: "http://127.0.0.1:54321", dev: false }));
      expect(local.get("connect-src")).toEqual(["'self'", "http://127.0.0.1:54321", BASEMAP_ASSETS]);
    }
  });
});

describe("buildStaticCsp", () => {
  const csp = directives(buildStaticCsp(PROD));

  it("can't be framed", () => {
    expect(csp.get("frame-ancestors")).toEqual(["'none'"]);
  });

  // Static pages carry no nonce (plan #6 accepts the limit).
  it("admits inline scripts but no eval, and no nonce", () => {
    expect(csp.get("script-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(buildStaticCsp(PROD)).not.toContain("nonce");
  });

  it("doesn't connect to Auth: no public page calls it", () => {
    expect(csp.get("connect-src")).toEqual(["'self'", "https://pub-0.r2.dev", BASEMAP_ASSETS]);
  });

  it("adds eval only under next dev", () => {
    expect(directives(buildStaticCsp({ ...PROD, dev: true })).get("script-src")).toContain("'unsafe-eval'");
  });
});

describe("isAdminPagePath", () => {
  it.each(["/admin", "/admin/", "/admin/login", "/admin/trucks/x"])("is true for %s", (path) => {
    expect(isAdminPagePath(path)).toBe(true);
  });

  // The forms Next's proxy matcher adds, and paths that only start like it.
  it.each(["/admin.json", "/admin.rsc", "/_next/data/x/admin.json", "/administrator", "/Admin/login", "/api/admin/trucks", "/map", "/%61dmin/login"])(
    "is false for %s",
    (path) => expect(isAdminPagePath(path)).toBe(false),
  );
});
