// `node scripts/smoke.mjs <baseUrl>` — the served-app check (Phase 8 plan, "Functions and
// scripts"; IS #286). CI's `build` job runs it against `next start` after `npm run build`.
//
// Requests each path in EXPECTATIONS with no session and `redirect: "manual"`, and fails
// (exit 1) on any answer that doesn't match: a wrong status, or the wrong shape (content
// type, JSON body, redirect target). It waits for the server to answer first.
//
// What it can't see: whether the map renders (the browser check stays manual, CLAUDE.md
// "Green gates don't show the map renders"), headers (Phase 9 adds them here), paths not
// listed, and anything behind a session.

import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

// Each path, and what it must answer with no session cookie.
// - `/api/live` answers `{ entries }` (`getLiveMap`, src/lib/services/live.ts), never a
//   bare array (CLAUDE.md, "`/api/live`").
// - `/admin` is redirected by the proxy with 303 to `/admin/login` (src/proxy.ts), and
//   `/api/admin/*` answers 401 `{ error }` before any Auth or database call.
export const EXPECTATIONS = [
  { path: "/map", status: 200, shape: "html" },
  { path: "/api/live", status: 200, shape: "entries" },
  { path: "/admin/login", status: 200, shape: "html" },
  { path: "/admin", status: 303, shape: "redirect", location: "/admin/login" },
  { path: "/api/admin/trucks", status: 401, shape: "error" },
];

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
      problems = checkResponse(expectation, await read(baseUrl, expectation.path));
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
