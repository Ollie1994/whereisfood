import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET } from "@/app/api/admin/trucks/route";
import { cookieHeader, keysOf, resetTables, seedTruck, sessionUser } from "./helpers";

// `GET /api/admin/trucks` on the admin's session against the local stack (Phase 7 plan,
// step 3). Refusals are `admin-auth.test.ts`'s. One sign-in (`sessionUser`).

const ORIGIN = "http://127.0.0.1:3000";
const TRUCK_KEYS = ["created_at", "cuisine_type", "description", "id", "instagram_handle", "is_active", "name"];

let cookie: string;

beforeAll(async () => {
  await resetTables();
  cookie = cookieHeader((await sessionUser({ isAdmin: true })).jar);
});
afterAll(resetTables);

describe("GET /api/admin/trucks", () => {
  it("answers every truck by Swedish name, inactive ones included, with no-store", async () => {
    const oel = await seedTruck("Öl");
    const inactive = await seedTruck("Bortlagd", false);
    const alpha = await seedTruck("Alpha");
    const fixtures = [oel, inactive, alpha];

    const response = await GET(new NextRequest(`${ORIGIN}/api/admin/trucks`, { headers: { host: "127.0.0.1:3000", cookie } }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const { trucks } = (await response.json()) as { trucks: { id: string; is_active: boolean }[] };
    expect(trucks.map((truck) => truck.id).filter((id) => fixtures.includes(id))).toEqual([alpha, inactive, oel]);
    expect(trucks.find((truck) => truck.id === inactive)?.is_active).toBe(false);
    expect(trucks.every((truck) => keysOf(truck).join() === TRUCK_KEYS.join())).toBe(true);
  });
});
