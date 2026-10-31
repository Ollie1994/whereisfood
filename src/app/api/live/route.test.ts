import { afterEach, describe, expect, it, vi } from "vitest";
import { findLocationsOverlapping } from "@/lib/db/locations";
import { listActiveTrucks } from "@/lib/db/trucks";

// The error cases of `GET /api/live`, as unit tests: the db layer is mocked, so each
// error goes through the real service and `withErrorHandling`. In the integration file
// the mock would replace the db layer for every test.
vi.mock("@/lib/db/trucks", () => ({ listActiveTrucks: vi.fn() }));
vi.mock("@/lib/db/locations", () => ({ findLocationsOverlapping: vi.fn() }));

import { GET } from "@/app/api/live/route";

// `restoreAllMocks` puts back the `console.error` spy but leaves the factories' `vi.fn()`s
// as the last case set them (vitest 4); `mockReset` clears those too, so no case inherits
// another's rejection.
afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(listActiveTrucks).mockReset();
  vi.mocked(findLocationsOverlapping).mockReset();
});

// Each read throws in turn while the other succeeds: a service that swallowed either
// one (e.g. no active trucks on error) would answer a cacheable 200 with no entries.
describe.each([
  ["the trucks read", () => vi.mocked(listActiveTrucks).mockRejectedValue(new Error("db unreachable"))],
  ["the locations read", () => vi.mocked(findLocationsOverlapping).mockRejectedValue(new Error("db unreachable"))],
])("GET /api/live when %s throws", (_name, failRead) => {
  it("answers 500 { error } without the cache header, never a 200 with no entries", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(listActiveTrucks).mockResolvedValue([]);
    vi.mocked(findLocationsOverlapping).mockResolvedValue([]);
    failRead();

    const res = await GET();

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error" });
    expect(res.headers.get("cache-control")).toBeNull();
  });
});
