// `node scripts/smoke.mjs <baseUrl>` — the served-app check (Phase 8 plan, "Functions and
// scripts"; IS #286). CI's `build` job runs it against `next start` after `npm run build`.
//
// Requests each path in EXPECTATIONS with no session and `redirect: "manual"`, and fails
// (exit 1) on any answer that doesn't match: a wrong status, the wrong shape (content
// type, JSON body, redirect target), or the wrong security headers (`checkHeaders`, Phase 9
// plan step 9, IS #387). It waits for the server to answer first.
//
// What it can't see: whether the map renders (the browser check stays manual, CLAUDE.md
// "Green gates don't show the map renders"), whether a CSP blocks something a page needs
// (the browser checks' console), the CSPs' sources, paths not listed, and anything behind a
// session.

import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

// Each path, and what it must answer with no session cookie.
// - `/api/live` answers `{ entries }` (`getLiveMap`, src/lib/services/live.ts), never a
//   bare array (CLAUDE.md, "`/api/live`").
// - `/admin` is redirected by the proxy with 303 to `/admin/login` (src/proxy.ts), and
//   `/api/admin/*` answers 401 `{ error }` before any Auth or database call.
// - `csp`: "static" for `next.config.ts`'s, "nonce" for the proxy's on `/admin`
//   (`src/lib/http/csp.ts`).
export const EXPECTATIONS = [
  { path: "/map", status: 200, shape: "html", csp: "static" },
  { path: "/api/live", status: 200, shape: "entries", csp: "static" },
  { path: "/admin/login", status: 200, shape: "html", csp: "nonce" },
  { path: "/admin", status: 303, shape: "redirect", location: "/admin/login", csp: "nonce" },
  { path: "/api/admin/trucks", status: 401, shape: "error", csp: "static" },
  // A case variant of `/admin/login`: a 404 the proxy doesn't run on under `next start`, so it
  // needs the static CSP, which only `next.config.ts`'s `caseSensitiveRoutes` gives it (PR #411,
  // round 1). On Vercel the proxy runs there and gives it the nonce CSP instead (IS #414), so
  // run against a Vercel deploy this path expects the wrong kind: these are `next start`'s.
  { path: "/Admin/login", status: 404, shape: "html", csp: "static" },
  // Forms the proxy runs on but sets no CSP for (`isAdminPagePath`), so they rest on
  // `headers()`' static one (PR #411, rounds 3 and 4).
  { path: "/admin.json", status: 303, shape: "redirect", location: "/admin/login", csp: "static" },
  { path: "/%61dmin/login", status: 303, shape: "redirect", location: "/admin/login", csp: "static" },
];

// The headers every answer carries (`next.config.ts`), written out here rather than
// imported from `csp.ts`, so a header dropped there fails this check.
export const STATIC_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "cross-origin-opener-policy": "same-origin",
  "permissions-policy": "camera=(), microphone=(), payment=(), usb=(), geolocation=(self)",
};

// How many policies a `Content-Security-Policy` value holds (0 for none). `Headers` joins two
// values with ", ", which no CSP here holds (`src/lib/http/csp.ts`), so a second policy is a
// second `default-src`. Also `src/proxy.test.ts`'s.
export function policyCount(csp) {
  return csp?.match(/default-src/g)?.length ?? 0;
}

// The nonce a CSP admits scripts by, or undefined. Also `src/proxy.test.ts`'s.
export function cspNonce(csp) {
  return /'nonce-([^']+)'/.exec(csp ?? "")?.[1];
}

// Pure. `response` is { headers, body }: `headers` a `Headers`, `body` the text read. The
// static headers, no `X-Powered-By`, and exactly one CSP of the expected kind, with
// `frame-ancestors 'none'`. A "nonce" page's HTML must carry that nonce on every script,
// which only a render per request can (the CSP would block the rest).
export function checkHeaders(expectation, response) {
  const problems = [];
  const { headers } = response;
  for (const [name, value] of Object.entries(STATIC_HEADERS)) {
    const got = headers.get(name);
    if (got !== value) problems.push(`${name} ${got === null ? "missing" : `"${got}"`}, expected "${value}"`);
  }
  if (headers.get("x-powered-by") !== null) problems.push(`x-powered-by "${headers.get("x-powered-by")}", expected none`);

  const csp = headers.get("content-security-policy");
  const count = policyCount(csp);
  if (count !== 1) {
    problems.push(`${count} CSPs, expected 1`);
    return problems;
  }
  if (!/frame-ancestors 'none'(;|$)/.test(csp)) problems.push("CSP without frame-ancestors 'none'");
  const nonce = cspNonce(csp);
  if (expectation.csp === "static" && nonce !== undefined) problems.push("a nonce CSP, expected the static one");
  if (expectation.csp === "nonce") {
    if (nonce === undefined) problems.push("the static CSP, expected a nonce one");
    else if (expectation.shape === "html") {
      // Any case: HTML tag names are case-insensitive (CodeQL `js/bad-tag-filter`, PR #411).
      const scripts = response.body.match(/<script\b[^>]*>/gi) ?? [];
      if (scripts.length === 0) problems.push("no <script> in the page");
      const bare = scripts.filter((tag) => !tag.includes(`nonce="${nonce}"`));
      if (bare.length > 0) problems.push(`${bare.length} of ${scripts.length} scripts without the CSP's nonce`);
    }
  }
  return problems;
}

// A JSON value is an object here only if it's a plain object, not an array or null.
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Pure. `response` is what main() read: { status, contentType, location, json, origin },
// where `json` is the parsed body, or undefined when it wasn't JSON, and `origin` is the
// server's own. Returns the mismatches as strings; empty when the answer matches.
export function checkResponse(expectation, response) {
  const problems = [];
  if (response.status !== expectation.status) {
    problems.push(`status ${response.status}, expected ${expectation.status}`);
  }
  const type = response.contentType ?? "";
  switch (expectation.shape) {
    case "html":
      if (!type.includes("text/html")) problems.push(`content-type "${type}", expected text/html`);
      break;
    case "entries":
      if (!type.includes("application/json")) problems.push(`content-type "${type}", expected application/json`);
      if (!isObject(response.json) || !Array.isArray(response.json.entries)) {
        problems.push("body isn't a JSON object whose `entries` is an array");
      }
      break;
    case "error":
      if (!type.includes("application/json")) problems.push(`content-type "${type}", expected application/json`);
      if (!isObject(response.json) || typeof response.json.error !== "string") {
        problems.push('body isn\'t a JSON object with a string `error`');
      }
      break;
    case "redirect": {
      // A Location may be relative; resolved against the server's origin, it must stay on
      // that origin and reach the expected path. A redirect to another host is what
      // src/proxy.ts builds its login redirect to avoid.
      // The server's origin is the caller's to give; without it this is a bug here, not a
      // bad redirect, so it throws.
      const origin = new URL(response.origin).origin;
      let target = null;
      try {
        target = response.location ? new URL(response.location, origin) : null;
      } catch {
        // A Location that isn't a URL: a bad redirect, reported below like any other.
      }
      if (target === null || target.origin !== origin || target.pathname !== expectation.location) {
        problems.push(`Location ${response.location ?? "(none)"}, expected path ${expectation.location} on ${response.origin}`);
      }
      break;
    }
    default:
      problems.push(`unknown shape ${expectation.shape}`);
  }
  return problems;
}

// A checked request's limit, so a request the server accepts and never answers fails its
// path here, and CI's step goes on to print the server's log within the job's own limit.
const REQUEST_TIMEOUT_MS = 30_000;
// One readiness poll's limit, short so waitForServer ends near its deadline.
const POLL_TIMEOUT_MS = 5_000;

// undici's fetch rejects with "fetch failed" and keeps the reason (ECONNREFUSED,
// ECONNRESET, a timeout) in `cause`.
function reason(err) {
  const cause = err.cause;
  return cause ? `${err.message} (${cause.code ?? cause.message ?? cause})` : err.message;
}

async function read(baseUrl, path) {
  const res = await fetch(new URL(path, baseUrl), {
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return {
    status: res.status,
    contentType: res.headers.get("content-type"),
    location: res.headers.get("location"),
    json,
    origin: new URL(baseUrl).origin,
    headers: res.headers,
    body: text,
  };
}

// Polls until the server answers anything, so a server still starting isn't a failure.
async function waitForServer(baseUrl, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await fetch(baseUrl, { redirect: "manual", signal: AbortSignal.timeout(POLL_TIMEOUT_MS) });
      return;
    } catch (err) {
      if (Date.now() > deadline) throw new Error(`no answer from ${baseUrl} within ${timeoutMs / 1000} s: ${reason(err)}`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

export async function main(baseUrl) {
  if (!baseUrl) {
    console.error("usage: node scripts/smoke.mjs <baseUrl>, e.g. http://127.0.0.1:3000");
    return 2;
  }
  await waitForServer(baseUrl, 60_000);
  let failed = 0;
  for (const expectation of EXPECTATIONS) {
    let problems;
    try {
      const response = await read(baseUrl, expectation.path);
      problems = [...checkResponse(expectation, response), ...checkHeaders(expectation, response)];
    } catch (err) {
      problems = [`no answer: ${reason(err)}`];
    }
    if (problems.length === 0) {
      console.log(`ok    ${expectation.path}`);
    } else {
      failed += 1;
      console.log(`FAIL  ${expectation.path}: ${problems.join("; ")}`);
    }
  }
  console.log(failed === 0 ? `smoke: all ${EXPECTATIONS.length} paths ok` : `smoke: ${failed} of ${EXPECTATIONS.length} paths failed`);
  return failed === 0 ? 0 : 1;
}

// Run only when executed, not when the test imports it.
// Run only when executed, not when a test imports it: `import.meta.main` (Node v26.13.0:
// true when run, false when imported, IS #286's PR), and on a Node without it the entry
// script's path compared with this file's.
const isMain =
  import.meta.main ?? (process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url);
if (isMain) {
  main(process.argv[2]).then(
    (code) => process.exit(code),
    (err) => {
      console.error(`smoke: ${err.message}`);
      process.exit(1);
    },
  );
}
