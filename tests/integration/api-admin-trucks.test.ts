import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as LIVE } from "@/app/api/live/route";
import { GET, POST } from "@/app/api/admin/trucks/route";
import { PATCH } from "@/app/api/admin/trucks/[id]/route";
import type { LiveResponse } from "@/lib/live";
import { supabaseAdmin } from "@/lib/supabase";
import { FIXTURE_PREFIX, cookieHeader, keysOf, resetTables, seedLocation, seedTruck, sessionUser } from "./helpers";

// The truck routes on the admin's session against the local stack (Phase 7 plan, steps 3
// and 10). Refusals of anyone else are `admin-auth.test.ts`'s. One sign-in (`sessionUser`).
// Every truck a test creates is named with the fixture prefix, so `resetTables` removes it,
// and every handle is the test's own (`handle`): the tables are reset once per file, since
// a reset also removes the signed-in admin.

const ORIGIN = "http://127.0.0.1:3000";
const HOUR = 3_600_000;
const TRUCK_KEYS = ["created_at", "cuisine_type", "description", "id", "instagram_handle", "is_active", "name"];

let cookie: string;

beforeAll(async () => {
  await resetTables();
  cookie = cookieHeader((await sessionUser({ isAdmin: true })).jar);
});
afterAll(resetTables);

function request(method: string, body?: unknown) {
  const headers: Record<string, string> = { host: "127.0.0.1:3000", origin: ORIGIN, cookie };
  const text = body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body);
  return new NextRequest(`${ORIGIN}/api/admin/trucks`, { method, headers, body: text });
}

const post = (body: unknown) => POST(request("POST", body));
const patch = (id: string, body: unknown) => PATCH(request("PATCH", body), { params: Promise.resolve({ id }) });
const named = (name: string) => `${FIXTURE_PREFIX}${name}`;
// A handle no other test uses.
const handle = (stem: string) => `itest_${stem}_${randomUUID().slice(0, 8)}`;

async function created(response: Response): Promise<{ id: string; instagram_handle: string | null }> {
  expect(response.status).toBe(201);
  return ((await response.json()) as { truck: { id: string; instagram_handle: string | null } }).truck;
}

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

describe("POST /api/admin/trucks", () => {
  it("creates an active truck with its handle in one form, 201 with no-store", async () => {
    const own = handle("ny.bil");
    const response = await post({ name: named("Ny"), instagram_handle: ` @${own.toUpperCase()} `, cuisine_type: "Tacos" });

    expect(response.headers.get("cache-control")).toBe("no-store");
    const truck = await created(response);
    expect(truck).toMatchObject({ name: named("Ny"), instagram_handle: own, is_active: true, description: null });
    expect(keysOf(truck)).toEqual(TRUCK_KEYS);
  });

  // #29: one account can't become two trucks, however its handle is typed.
  it.each([
    ["the same", (own: string) => own],
    ["in capitals", (own: string) => own.toUpperCase()],
    ["with a leading @", (own: string) => `@${own}`],
    ["with surrounding spaces", (own: string) => `  ${own} `],
  ])("answers a handle another truck has, typed %s, with 409 in Swedish", async (_, typed) => {
    const own = handle("dup");
    await created(await post({ name: named("Först"), instagram_handle: own }));

    const response = await post({ name: named("Sen"), instagram_handle: typed(own) });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Instagram-kontot används redan av en annan foodtruck" });
  });

  // #29: no handle, a blank field included, is none, so two of them aren't a duplicate.
  it("creates two trucks with no handle, one sent blank", async () => {
    await created(await post({ name: named("Utan ett") }));
    const truck = await created(await post({ name: named("Utan två"), instagram_handle: "   " }));

    expect(truck.instagram_handle).toBeNull();
  });

  it.each([
    ["a space after the @", { name: named("X"), instagram_handle: "@ foo" }, "Ogiltigt Instagram-konto: bara a–z, 0–9, punkt och understreck, högst 30 tecken"],
    ["a space inside the handle", { name: named("X"), instagram_handle: "foo bar" }, "Ogiltigt Instagram-konto: bara a–z, 0–9, punkt och understreck, högst 30 tecken"],
    ["a 31-character handle", { name: named("X"), instagram_handle: "a".repeat(31) }, "Ogiltigt Instagram-konto: bara a–z, 0–9, punkt och understreck, högst 30 tecken"],
    ["no name", { instagram_handle: "foo" }, "Ange foodtruckens namn"],
    ["a body that isn't valid JSON", "{", undefined],
  ])("answers %s with 400 in Swedish, creating nothing", async (_, body, error) => {
    const before = await countFixtureTrucks();

    const response = await post(body);

    expect(response.status).toBe(400);
    const json = (await response.json()) as { error: string };
    if (error) expect(json).toEqual({ error });
    else expect(json.error).toEqual(expect.any(String));
    expect(await countFixtureTrucks()).toBe(before);
  });
});

describe("PATCH /api/admin/trucks/[id]", () => {
  it("edits the fields the patch holds, 200 with the truck", async () => {
    const id = await seedTruck("Före");

    const response = await patch(id, { name: named("Efter"), description: "Ny text" });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(((await response.json()) as { truck: unknown }).truck).toMatchObject({
      id,
      name: named("Efter"),
      description: "Ny text",
      is_active: true,
    });
  });

  // Set inactive: the truck leaves the public map and keeps its history.
  it("sets a truck inactive: it leaves /api/live and keeps its locations", async () => {
    const id = await seedTruck("Försvinner");
    const now = Date.now();
    const location = await seedLocation(id, {
      starts_at: new Date(now - HOUR).toISOString(),
      ends_at: new Date(now + HOUR).toISOString(),
    });
    const onMap = async () =>
      ((await (await LIVE()).json()) as LiveResponse).entries.some((entry) => entry.id === location.id);
    expect(await onMap()).toBe(true);

    const response = await patch(id, { is_active: false });

    expect(response.status).toBe(200);
    expect(await onMap()).toBe(false);
    const { data, error } = await supabaseAdmin.from("locations").select("id").eq("truck_id", id);
    if (error) throw error;
    expect(data.map((row) => row.id)).toEqual([location.id]);
  });

  it("answers a handle another truck has with 409, whatever its case", async () => {
    const own = handle("taken");
    await created(await post({ name: named("Har kontot"), instagram_handle: own }));
    const id = await seedTruck("Vill ha kontot");

    const response = await patch(id, { instagram_handle: `@${own.toUpperCase()}` });

    expect(response.status).toBe(409);
  });

  it("answers an unknown truck with 404", async () => {
    const response = await patch(randomUUID(), { is_active: false });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Foodtrucken finns inte" });
  });

  it.each([
    ["a malformed id", "abc", { is_active: false }, "Ogiltigt id"],
    ["a patch with no known key", null, { id: "x" }, "Ändringen innehåller inget att ändra"],
    ["a blank name", null, { name: " " }, "Ange foodtruckens namn"],
  ])("answers %s with 400 in Swedish", async (_, badId, body, error) => {
    const id = badId ?? (await seedTruck("Orörd"));

    const response = await patch(id, body);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error });
  });
});

async function countFixtureTrucks(): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("trucks")
    .select("id", { count: "exact", head: true })
    .like("name", `${FIXTURE_PREFIX}%`);
  if (error) throw error;
  return count ?? 0;
}
