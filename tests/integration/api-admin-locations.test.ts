import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/admin/locations/route";
import { PATCH } from "@/app/api/admin/locations/[id]/route";
import { POST as CANCEL } from "@/app/api/admin/locations/[id]/cancel/route";
import { POST as CONFIRM } from "@/app/api/admin/locations/[id]/confirm/route";
import { supabaseAdmin } from "@/lib/supabase";
import { FIXTURE_PLACE, cookieHeader, readLocation, resetTables, seedLocation, seedTruck, sessionUser } from "./helpers";

// The location routes on the admin's session against the local stack (Phase 7 plan, step
// 6). Refusals of anyone else are `admin-auth.test.ts`'s. One sign-in (`sessionUser`).
//
// The routes read the real clock, so every window here is built from `base`, the next whole
// hour: ahead of now, or behind it for an entry that has ended (#33).

const ORIGIN = "http://127.0.0.1:3000";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

type Handler = (request: NextRequest, context: { params: Promise<{ id: string }> }) => Promise<Response>;

let cookie: string;
let adminId: string;
let truckId: string;
// The next whole hour, read once per test: read per window, two windows built either side
// of an hour boundary would land an hour apart (PR for IS #226, round 1).
let base: number;

beforeAll(async () => {
  await resetTables();
  const admin = await sessionUser({ isAdmin: true });
  cookie = cookieHeader(admin.jar);
  adminId = admin.userId;
});
afterAll(resetTables);

beforeEach(async () => {
  base = Math.ceil(Date.now() / HOUR) * HOUR;
  truckId = await seedTruck("Platsbil");
});

function request(method: string, body?: unknown) {
  const headers: Record<string, string> = { host: "127.0.0.1:3000", origin: ORIGIN, cookie };
  const text = body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body);
  return new NextRequest(`${ORIGIN}/api/admin/locations`, { method, headers, body: text });
}

function call(handler: Handler, method: string, id: string, body?: unknown) {
  return handler(request(method, body), { params: Promise.resolve({ id }) });
}

// A window starting `fromNow` after `base`, `hours` long, as ISO strings.
function window(fromNow: number, hours = 2) {
  const start = base + fromNow;
  return { starts_at: new Date(start).toISOString(), ends_at: new Date(start + hours * HOUR).toISOString() };
}

// Stockholm's "2026-08-22 11:00" for an instant, through `Intl` directly rather than the
// code under test.
const SV = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", dateStyle: "short", timeStyle: "short" });
function stockholmText(iso: string): [string, string] {
  const [date, time] = SV.format(new Date(iso)).split(" ");
  return [date, time];
}
function overlapText(other: { starts_at: string; ends_at: string }): string {
  const [startDate, startTime] = stockholmText(other.starts_at);
  const [endDate, endTime] = stockholmText(other.ends_at);
  const until = endDate === startDate ? endTime : `${endDate} ${endTime}`;
  return `Överlappar med ${startDate} ${startTime}–${until} — redigera den istället`;
}

async function countLocations(truck: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("locations")
    .select("id", { count: "exact", head: true })
    .eq("truck_id", truck);
  if (error) throw error;
  return count ?? 0;
}

describe("POST /api/admin/locations", () => {
  it("creates the entry with 201, written by the admin as source admin, whatever the body says", async () => {
    const body = { truck_id: truckId, ...FIXTURE_PLACE, ...window(HOUR), created_by: randomUUID(), source: "owner" };

    const response = await POST(request("POST", body));

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const { entry } = (await response.json()) as { entry: { id: string; label: string } };
    expect(entry.label).toBe("Järntorget");
    const stored = await readLocation(entry.id);
    expect(stored.created_by).toBe(adminId);
    expect(stored.source).toBe("admin");
  });

  it("refuses an inactive truck with 400 and a Swedish message", async () => {
    const inactive = await seedTruck("Bortlagd", false);

    const response = await POST(request("POST", { truck_id: inactive, ...FIXTURE_PLACE, ...window(HOUR) }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Foodtrucken finns inte eller är inte aktiv" });
    expect(await countLocations(inactive)).toBe(0);
  });

  it("refuses an entry that has already ended with 400 (#33)", async () => {
    const response = await POST(request("POST", { truck_id: truckId, ...FIXTURE_PLACE, ...window(-DAY) }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Tiden har redan passerat" });
    expect(await countLocations(truckId)).toBe(0);
  });

  it("answers an overlap with 409 naming the other entry's Stockholm times, and changes nothing", async () => {
    const existing = await seedLocation(truckId, window(HOUR));

    const response = await POST(request("POST", { truck_id: truckId, ...FIXTURE_PLACE, ...window(2 * HOUR) }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: overlapText(existing) });
    expect(await countLocations(truckId)).toBe(1);
    expect(await readLocation(existing.id)).toEqual(existing);
  });

  it.each([
    ["a body that isn't JSON", "{not json", "Begärans innehåll är inte giltig JSON"],
    ["a malformed truck id", { truck_id: "nope" }, "Ogiltig foodtruck"],
  ])("refuses %s with 400 and a Swedish message", async (_, body, error) => {
    const response = await POST(request("POST", body));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error });
  });
});

describe("PATCH /api/admin/locations/[id]", () => {
  it("edits the label and answers with the entry", async () => {
    const { id } = await seedLocation(truckId, window(HOUR));

    const response = await call(PATCH, "PATCH", id, { label: "Heden" });

    expect(response.status).toBe(200);
    expect(((await response.json()) as { entry: { label: string } }).entry.label).toBe("Heden");
    expect((await readLocation(id)).label).toBe("Heden");
  });

  // The merged entry is checked, so one field alone can't pass a bad pair.
  it.each([
    ["an end before the stored start", () => ({ ends_at: new Date(Date.now() - HOUR).toISOString() }), "Sluttiden måste vara efter starttiden"],
    ["a latitude outside Gothenburg", () => ({ latitude: 59.3293 }), "Platsen ligger utanför Göteborg"],
    ["a patch with no known key", () => ({ truck_id: randomUUID() }), "Ändringen innehåller inget att ändra"],
  ])("refuses %s with 400 and leaves the entry", async (_, patch, error) => {
    const seeded = await seedLocation(truckId, window(2 * HOUR));

    const response = await call(PATCH, "PATCH", seeded.id, patch());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error });
    expect(await readLocation(seeded.id)).toEqual(seeded);
  });

  it("refuses to edit an entry that has ended with 400 (#33)", async () => {
    const seeded = await seedLocation(truckId, window(-DAY));

    const response = await call(PATCH, "PATCH", seeded.id, { label: "Heden" });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Posten har redan slutat och kan inte ändras" });
    expect(await readLocation(seeded.id)).toEqual(seeded);
  });

  it("answers an overlap with 409 naming the other entry, not the one edited", async () => {
    const other = await seedLocation(truckId, window(3 * HOUR));
    const edited = await seedLocation(truckId, window(HOUR));

    const response = await call(PATCH, "PATCH", edited.id, { ends_at: window(4 * HOUR).starts_at });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: overlapText(other) });
    expect(await readLocation(edited.id)).toEqual(edited);
  });

  it("answers a missing or cancelled entry with 404, and a malformed id with 400", async () => {
    const cancelled = await seedLocation(truckId, { ...window(HOUR), cancelled_at: new Date().toISOString() });

    for (const id of [randomUUID(), cancelled.id]) {
      const response = await call(PATCH, "PATCH", id, { label: "Heden" });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "Posten finns inte" });
    }
    const response = await call(PATCH, "PATCH", "nope", { label: "Heden" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Ogiltigt id" });
  });
});

describe("POST /api/admin/locations/[id]/cancel", () => {
  it("sets cancelled_at and keeps the row; a second cancel is 404 and keeps the first time", async () => {
    const { id } = await seedLocation(truckId, window(HOUR));

    const first = await call(CANCEL, "POST", id);
    expect(first.status).toBe(200);
    const cancelledAt = (await readLocation(id)).cancelled_at;
    expect(cancelledAt).not.toBeNull();

    const second = await call(CANCEL, "POST", id);
    expect(second.status).toBe(404);
    expect(await second.json()).toEqual({ error: "Posten finns inte" });
    expect((await readLocation(id)).cancelled_at).toBe(cancelledAt);
  });

  it("answers a malformed id with 400", async () => {
    const response = await call(CANCEL, "POST", "nope");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Ogiltigt id" });
  });
});

describe("POST /api/admin/locations/[id]/confirm", () => {
  it("moves updated_at and nothing else (#18)", async () => {
    const seeded = await seedLocation(truckId, window(HOUR));

    const response = await call(CONFIRM, "POST", seeded.id);

    expect(response.status).toBe(200);
    const stored = await readLocation(seeded.id);
    expect(Date.parse(stored.updated_at)).toBeGreaterThan(Date.parse(seeded.updated_at));
    expect({ ...stored, updated_at: seeded.updated_at }).toEqual(seeded);
  });

  it("answers a cancelled entry with 404 and leaves it", async () => {
    const seeded = await seedLocation(truckId, { ...window(HOUR), cancelled_at: new Date().toISOString() });

    const response = await call(CONFIRM, "POST", seeded.id);

    expect(response.status).toBe(404);
    expect(await readLocation(seeded.id)).toEqual(seeded);
  });
});

describe("GET /api/admin/locations", () => {
  it("lists live entries from today for 14 days, with truck names, an inactive truck's included", async () => {
    const inactive = await seedTruck("Bortlagd", false);
    const soon = await seedLocation(truckId, window(HOUR));
    const ofInactive = await seedLocation(inactive, window(HOUR));
    const cancelled = await seedLocation(truckId, { ...window(5 * HOUR), cancelled_at: new Date().toISOString() });
    const later = await seedLocation(truckId, window(20 * DAY));
    const yesterday = await seedLocation(truckId, window(-2 * DAY));

    const response = await GET(request("GET"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const { entries } = (await response.json()) as { entries: { id: string; truck_name: string }[] };
    const ours = entries.filter((entry) =>
      [soon, ofInactive, cancelled, later, yesterday].some((row) => row.id === entry.id),
    );
    expect(ours.map((entry) => entry.id).sort()).toEqual([soon.id, ofInactive.id].sort());
    expect(ours.find((entry) => entry.id === ofInactive.id)?.truck_name).toBe("itest-fixture-Bortlagd");
  });
});
