import { afterEach, describe, expect, it, vi } from "vitest";
import { API_ERRORS, adminFetch, mayHaveChanged } from "@/lib/admin-api";

// `adminFetch` against a stubbed `fetch`: what each kind of answer becomes.
afterEach(() => vi.unstubAllGlobals());

function answer(status: number, body: string) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status })));
}

describe("adminFetch", () => {
  it("gives a 2xx's JSON as data", async () => {
    answer(200, '{"entries":[]}');
    expect(await adminFetch("/api/admin/locations")).toEqual({ ok: true, data: { entries: [] } });
  });

  it("gives a refusal's `{ error }` as the error", async () => {
    answer(409, '{"error":"Överlappar med …"}');
    expect(await adminFetch("/api/admin/locations")).toEqual({ ok: false, error: "Överlappar med …", status: 409 });
  });

  // A body cut off mid-way or a proxy's HTML page with a 2xx status, and a refusal whose
  // body has no `{ error }`.
  it.each([
    ["a 2xx whose body isn't JSON", 200, "<html>", undefined],
    ["a 2xx with an empty body", 200, "", undefined],
    ["a refusal with no `{ error }`", 500, "{}", 500],
  ])("gives %s as an error, never null data", async (_, status, body, kept) => {
    answer(status, body);
    expect(await adminFetch("/api/admin/locations")).toEqual({ ok: false, error: API_ERRORS.unknown, status: kept });
  });

  it("gives a failed request as the network error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    expect(await adminFetch("/api/admin/locations")).toEqual({ ok: false, error: API_ERRORS.network });
  });
});

describe("mayHaveChanged", () => {
  it("is true after a success, an answer with no status, and any refusal but the session's", () => {
    expect(mayHaveChanged({ ok: true })).toBe(true);
    expect(mayHaveChanged({ ok: false })).toBe(true);
    for (const status of [400, 404, 408, 409, 422, 500, 503]) {
      expect(mayHaveChanged({ ok: false, status })).toBe(true);
    }
  });

  it("is false after a session refusal, 401 or 403", () => {
    expect(mayHaveChanged({ ok: false, status: 401 })).toBe(false);
    expect(mayHaveChanged({ ok: false, status: 403 })).toBe(false);
  });
});
