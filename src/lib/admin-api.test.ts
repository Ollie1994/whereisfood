import { afterEach, describe, expect, it, vi } from "vitest";
import { API_ERRORS, adminFetch } from "@/lib/admin-api";

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

  // A caller reads "gone" from it, so a missing entry or truck is re-read off the list.
  it("keeps a refusal's status", async () => {
    answer(404, '{"error":"Posten finns inte"}');
    expect(await adminFetch("/api/admin/locations/x")).toMatchObject({ ok: false, status: 404 });
  });

  it("gives a failed request as the network error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    expect(await adminFetch("/api/admin/locations")).toEqual({ ok: false, error: API_ERRORS.network });
  });
});
