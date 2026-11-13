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

// Pure. `response` is what main() read: { status, contentType, location, json }, where
// `json` is the parsed body, or undefined when it wasn't JSON. Returns the mismatches as
// strings; empty when the answer matches.
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
      // A Location may be relative; resolve it against any base to read its path.
      const path = response.location ? new URL(response.location, "http://smoke.invalid").pathname : null;
      if (path !== expectation.location) {
        problems.push(`Location ${response.location ?? "(none)"}, expected path ${expectation.location}`);
      }
      break;
    }
    default:
      problems.push(`unknown shape ${expectation.shape}`);
  }
  return problems;
}

// Each request's limit, so a request the server accepts and never answers fails its path
// here, and CI's step goes on to print the server's log within the job's own limit.
const REQUEST_TIMEOUT_MS = 30_000;

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
  };
}

// Polls until the server answers anything, so a server still starting isn't a failure.
async function waitForServer(baseUrl, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await fetch(baseUrl, { redirect: "manual", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      return;
    } catch (err) {
      if (Date.now() > deadline) throw new Error(`no answer from ${baseUrl} within ${timeoutMs / 1000} s: ${err.message}`);
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
      problems = [`no answer: ${err.message}`];
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
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv[2]).then(
    (code) => process.exit(code),
    (err) => {
      console.error(`smoke: ${err.message}`);
      process.exit(1);
    },
  );
}
