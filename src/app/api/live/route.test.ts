import { describe, expect, it, vi } from "vitest";

// The error case of `GET /api/live`, as a unit test: the db layer is mocked to throw, so
// the error goes through the real service and `withErrorHandling`. In the integration
// file the mock would replace the db layer for every test.
vi.mock("@/lib/db/trucks", () => ({ listActiveTrucks: vi.fn(async () => []) }));
vi.mock("@/lib/db/locations", () => ({
  findLocationsOverlapping: vi.fn(async () => {
    throw new Error("db unreachable");
  }),
}));

import { GET } from "@/app/api/live/route";

describe("GET /api/live when the db layer throws", () => {
  it("answers 500 { error } without the cache header, never a 200 with no entries", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await GET();

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error" });
    expect(res.headers.get("cache-control")).toBeNull();
  });
});
