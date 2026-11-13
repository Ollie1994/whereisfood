import { describe, expect, it } from "vitest";
import { EXPECTATIONS, checkResponse } from "./smoke.mjs";

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
    right: { status: 303, location: "/admin/login" },
    // The admin page served with no session: the proxy not guarding it.
    wrongStatus: { status: 200, contentType: HTML },
    wrongShape: { status: 303, location: "/map" },
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
  it("reads a relative or absolute Location by its path", () => {
    expect(checkResponse(byPath("/admin"), { status: 303, location: "http://127.0.0.1:3000/admin/login" })).toEqual([]);
  });
  it("fails a redirect with no Location", () => {
    expect(checkResponse(byPath("/admin"), { status: 303 })).toHaveLength(1);
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
