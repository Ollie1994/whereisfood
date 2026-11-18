import { describe, expect, it } from "vitest";
import { EXPECTATIONS, STATIC_HEADERS, checkHeaders, checkResponse } from "./smoke.mjs";

const byPath = (path) => {
  const expectation = EXPECTATIONS.find((e) => e.path === path);
  if (!expectation) throw new Error(`no expectation for ${path}`);
  return expectation;
};

const HTML = "text/html; charset=utf-8";
const JSON_TYPE = "application/json";

// Each path: its right answer, a wrong status, and a wrong shape (IS #286).
const CASES = [
  {
    path: "/map",
    right: { status: 200, contentType: HTML },
    wrongStatus: { status: 500, contentType: HTML },
    wrongShape: { status: 200, contentType: JSON_TYPE, json: {} },
  },
  {
    path: "/api/live",
    right: { status: 200, contentType: JSON_TYPE, json: { entries: [] } },
    wrongStatus: { status: 500, contentType: JSON_TYPE, json: { error: "x" } },
    // A bare array: what CLAUDE.md's "Never return `[]` on error" guards against.
    wrongShape: { status: 200, contentType: JSON_TYPE, json: [] },
  },
  {
    path: "/admin/login",
    right: { status: 200, contentType: HTML },
    wrongStatus: { status: 404, contentType: HTML },
    wrongShape: { status: 200, contentType: "text/plain" },
  },
  {
    path: "/admin",
    right: { status: 303, location: "/admin/login", origin: "http://127.0.0.1:3000" },
    // The admin page served with no session: the proxy not guarding it.
    wrongStatus: { status: 200, contentType: HTML, origin: "http://127.0.0.1:3000" },
    wrongShape: { status: 303, location: "/map", origin: "http://127.0.0.1:3000" },
  },
  {
    path: "/api/admin/trucks",
    right: { status: 401, contentType: JSON_TYPE, json: { error: "x" } },
    // The trucks list served with no session.
    wrongStatus: { status: 200, contentType: JSON_TYPE, json: { trucks: [] } },
    wrongShape: { status: 401, contentType: JSON_TYPE, json: { message: "x" } },
  },
];

describe("EXPECTATIONS", () => {
  it("covers exactly the five paths the tests below check", () => {
    expect(EXPECTATIONS.map((e) => e.path).sort()).toEqual(CASES.map((c) => c.path).sort());
  });
  it("names each path's CSP: the proxy's nonce one under /admin, the static one elsewhere", () => {
    for (const { path, csp } of EXPECTATIONS) expect(csp, path).toBe(/^\/admin(\/|$)/.test(path) ? "nonce" : "static");
  });
});

describe.each(CASES)("checkResponse for $path", ({ path, right, wrongStatus, wrongShape }) => {
  it("passes its right answer", () => {
    expect(checkResponse(byPath(path), right)).toEqual([]);
  });
  it("fails a wrong status", () => {
    expect(checkResponse(byPath(path), wrongStatus).some((p) => p.startsWith("status "))).toBe(true);
  });
  it("fails a wrong shape", () => {
    const problems = checkResponse(byPath(path), wrongShape);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.some((p) => p.startsWith("status "))).toBe(false);
  });
});

describe("checkResponse details", () => {
  it("takes a relative Location, or an absolute one on the server's origin", () => {
    const origin = "http://127.0.0.1:3000";
    expect(checkResponse(byPath("/admin"), { status: 303, location: "/admin/login", origin })).toEqual([]);
    expect(checkResponse(byPath("/admin"), { status: 303, location: "http://127.0.0.1:3000/admin/login", origin })).toEqual([]);
  });
  it("fails a Location on another host, even with the right path", () => {
    const origin = "http://127.0.0.1:3000";
    for (const location of ["http://evil.example/admin/login", "//evil.example/admin/login", "http://127.0.0.1:4000/admin/login"]) {
      expect(checkResponse(byPath("/admin"), { status: 303, location, origin })).toHaveLength(1);
    }
  });
  it("takes an origin given with a trailing slash", () => {
    expect(checkResponse(byPath("/admin"), { status: 303, location: "/admin/login", origin: "http://127.0.0.1:3000/" })).toEqual([]);
  });
  it("throws without the server's origin, a bug in the caller, not a bad redirect", () => {
    expect(() => checkResponse(byPath("/admin"), { status: 303, location: "/admin/login" })).toThrow();
  });
  it("fails a redirect with no Location", () => {
    expect(checkResponse(byPath("/admin"), { status: 303, origin: "http://127.0.0.1:3000" })).toHaveLength(1);
  });
  it("reports a Location that isn't a URL as a bad redirect, not a throw", () => {
    const problems = checkResponse(byPath("/admin"), { status: 303, location: "http://[x", origin: "http://127.0.0.1:3000" });
    expect(problems).toEqual(["Location http://[x, expected path /admin/login on http://127.0.0.1:3000"]);
  });
  it("fails a JSON object whose `entries` isn't an array", () => {
    for (const json of [{}, { entries: "x" }, { entries: null }]) {
      expect(checkResponse(byPath("/api/live"), { status: 200, contentType: JSON_TYPE, json })).toHaveLength(1);
    }
  });
  it("fails a body that isn't JSON", () => {
    expect(checkResponse(byPath("/api/live"), { status: 200, contentType: JSON_TYPE, json: undefined })).toHaveLength(1);
  });
});

// `checkHeaders` (IS #387): the static headers, one CSP of the path's kind, and on a nonce
// page every script carrying the CSP's nonce.
describe("checkHeaders", () => {
  const STATIC_CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'";
  const nonceCsp = (nonce) => `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'; frame-ancestors 'none'`;
  const PAGE = '<script nonce="abc" src="/a.js"></script><script nonce="abc">x</script>';
  const answer = (csp, extra = {}, body = "") => {
    const headers = new Headers({ ...STATIC_HEADERS, ...extra });
    if (csp !== null) headers.set("content-security-policy", csp);
    return { headers, body };
  };

  it("passes each path's right headers", () => {
    expect(checkHeaders(byPath("/map"), answer(STATIC_CSP))).toEqual([]);
    expect(checkHeaders(byPath("/api/live"), answer(STATIC_CSP))).toEqual([]);
    expect(checkHeaders(byPath("/api/admin/trucks"), answer(STATIC_CSP))).toEqual([]);
    expect(checkHeaders(byPath("/admin/login"), answer(nonceCsp("abc"), {}, PAGE))).toEqual([]);
    expect(checkHeaders(byPath("/admin"), answer(nonceCsp("abc")))).toEqual([]);
  });

  it.each(Object.keys(STATIC_HEADERS))("fails a missing %s", (name) => {
    const response = answer(STATIC_CSP);
    response.headers.delete(name);
    expect(checkHeaders(byPath("/map"), response)).toEqual([`${name} missing, expected "${STATIC_HEADERS[name]}"`]);
  });

  it("fails a wrong value and an X-Powered-By", () => {
    expect(checkHeaders(byPath("/map"), answer(STATIC_CSP, { "x-frame-options": "SAMEORIGIN" }))).toHaveLength(1);
    expect(checkHeaders(byPath("/map"), answer(STATIC_CSP, { "x-powered-by": "Next.js" }))).toEqual(['x-powered-by "Next.js", expected none']);
  });

  it("fails no CSP, and two", () => {
    expect(checkHeaders(byPath("/map"), answer(null))).toEqual(["0 CSPs, expected 1"]);
    const two = answer(STATIC_CSP);
    two.headers.append("content-security-policy", nonceCsp("abc"));
    expect(checkHeaders(byPath("/admin/login"), two)).toEqual(["2 CSPs, expected 1"]);
  });

  it("fails a CSP without frame-ancestors 'none'", () => {
    expect(checkHeaders(byPath("/map"), answer("default-src 'self'; frame-ancestors 'self'"))).toEqual([
      "CSP without frame-ancestors 'none'",
    ]);
  });

  it("fails the wrong kind of CSP", () => {
    expect(checkHeaders(byPath("/map"), answer(nonceCsp("abc")))).toEqual(["a nonce CSP, expected the static one"]);
    expect(checkHeaders(byPath("/admin"), answer(STATIC_CSP))).toEqual(["the static CSP, expected a nonce one"]);
  });

  // A page built at build time: Next's scripts carry no nonce, or another request's.
  it("fails a nonce page whose scripts lack the CSP's nonce, or that has none", () => {
    const login = byPath("/admin/login");
    expect(checkHeaders(login, answer(nonceCsp("xyz"), {}, PAGE))).toEqual(["2 of 2 scripts without the CSP's nonce"]);
    expect(checkHeaders(login, answer(nonceCsp("abc"), {}, PAGE + "<script>y</script>"))).toEqual([
      "1 of 3 scripts without the CSP's nonce",
    ]);
    expect(checkHeaders(login, answer(nonceCsp("abc"), {}, "<p>x</p>"))).toEqual(["no <script> in the page"]);
    expect(checkHeaders(login, answer(nonceCsp("abc"), {}, PAGE + "<SCRIPT src=/x.js></SCRIPT>"))).toEqual([
      "1 of 3 scripts without the CSP's nonce",
    ]);
  });
});
