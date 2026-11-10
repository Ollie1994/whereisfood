import { NextRequest } from "next/server";
import { type TestContext, afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET } from "@/app/api/admin/checklist/route";
import { POST } from "@/app/api/admin/locations/route";
import { POST as CANCEL } from "@/app/api/admin/locations/[id]/cancel/route";
import { getChecklist, type Suggestion } from "@/lib/services/checklist";
import { entryWindow, stockholmDay } from "@/lib/stockholm";
import { cookieHeader, resetTables, seedLocation, seedTruck, sessionUser } from "./helpers";

// The checklist against the local stack (Phase 7 plan, step 11). Refusals of anyone but the
// admin are `admin-auth.test.ts`'s. One sign-in (`sessionUser`).
//
// The route reads the real clock, so its cases use a 23:00–01:00 shift: moved to today it
// ends at 01:00 tomorrow, after any time of today, so it hasn't ended whenever the test runs.
// The windows come from `stockholm.ts`, which `stockholm.test.ts` checks against `Intl`. The
// rules that need a fixed clock call `getChecklist` with one, against the same database.
// Only fixture trucks' suggestions are read: the seed's trucks have their own. A case whose
// read lands on another Stockholm day than its seed was built for skips, rather than fail:
// `today` is read before the seed, and the route reads the clock again.

const ORIGIN = "http://127.0.0.1:3000";

let cookie: string;

beforeAll(async () => {
  await resetTables();
  cookie = cookieHeader((await sessionUser({ isAdmin: true })).jar);
});
afterAll(resetTables);

function request(path: string, method = "GET", body?: unknown) {
  const headers: Record<string, string> = { host: "127.0.0.1:3000", origin: ORIGIN, cookie };
  return new NextRequest(`${ORIGIN}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

const iso = (date: Date) => date.toISOString();

// 23:00 on Stockholm day `day` to 01:00 the next.
function lateShift(day: number) {
  const window = entryWindow(day, "23:00", "01:00");
  if (!window) throw new Error(`no 23:00–01:00 on day ${day}`);
  return { starts_at: iso(window.startsAt), ends_at: iso(window.endsAt) };
}

// The route's answer, skipping the case if Stockholm's day is no longer `today`.
async function read(ctx: TestContext, today: number): Promise<Response> {
  const response = await GET(request("/api/admin/checklist"));
  if (stockholmDay(new Date()) !== today) ctx.skip();
  return response;
}

async function readChecklist(ctx: TestContext, today: number): Promise<{ day: string; suggestions: Suggestion[] }> {
  const response = await read(ctx, today);
  expect(response.status).toBe(200);
  return response.json();
}

const ofTruck = (suggestions: Suggestion[], truckId: string) => suggestions.filter((s) => s.truck_id === truckId);
const windows = (suggestions: Suggestion[]) => suggestions.map((s) => [Date.parse(s.starts_at), Date.parse(s.ends_at)]);

describe("GET /api/admin/checklist", () => {
  it("suggests last week's entry on today's date, uncached, with today's Stockholm date", async (ctx) => {
    const truckId = await seedTruck("Checklistbil");
    const today = stockholmDay(new Date());
    const source = await seedLocation(truckId, { ...lateShift(today - 7), label: "Heden" });

    const response = await read(ctx, today);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const { day, suggestions } = (await response.json()) as { day: string; suggestions: Suggestion[] };
    expect(day).toBe(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Stockholm" }).format(new Date()));
    const expected = lateShift(today);
    expect(ofTruck(suggestions, truckId)).toEqual([
      {
        truck_id: truckId,
        truck_name: "itest-fixture-Checklistbil",
        latitude: source.latitude,
        longitude: source.longitude,
        label: "Heden",
        starts_at: expected.starts_at,
        ends_at: expected.ends_at,
        from_id: source.id,
        from_starts_at: source.starts_at,
      },
    ]);
  });

  it("✓ is the ordinary create, and the suggestion then leaves the checklist", async (ctx) => {
    const truckId = await seedTruck("Bekräftad");
    const today = stockholmDay(new Date());
    await seedLocation(truckId, lateShift(today - 7));

    const [suggestion] = ofTruck((await readChecklist(ctx, today)).suggestions, truckId);
    const { truck_id, latitude, longitude, label, starts_at, ends_at } = suggestion;
    const created = await POST(request("/api/admin/locations", "POST", { truck_id, latitude, longitude, label, starts_at, ends_at }));

    expect(created.status).toBe(201);
    expect(ofTruck((await readChecklist(ctx, today)).suggestions, truckId)).toEqual([]);
  });

  it("leaves out a suggestion overlapping the truck's live entry, and suggests it again once that is cancelled", async (ctx) => {
    const truckId = await seedTruck("Upptagen");
    const today = stockholmDay(new Date());
    await seedLocation(truckId, lateShift(today - 7));
    const tonight = lateShift(today);
    const existing = await seedLocation(truckId, { starts_at: tonight.starts_at, ends_at: tonight.ends_at });

    expect(ofTruck((await readChecklist(ctx, today)).suggestions, truckId)).toEqual([]);

    const cancelled = await CANCEL(request(`/api/admin/locations/${existing.id}/cancel`, "POST"), {
      params: Promise.resolve({ id: existing.id }),
    });
    expect(cancelled.status).toBe(200);

    expect(ofTruck((await readChecklist(ctx, today)).suggestions, truckId)).toHaveLength(1);
  });
});

// Wednesday 2026-08-26, 08:00 Stockholm (CEST). The weeks back: 08-19, 08-12, 08-05, 07-29.
const NOW = new Date("2026-08-26T06:00:00Z");

describe("getChecklist on the local stack, at a fixed now", () => {
  it("suggests lunch and dinner from the most recent matching day, not an older one", async () => {
    const truckId = await seedTruck("Lunch och middag");
    await seedLocation(truckId, { starts_at: "2026-08-19T09:00:00Z", ends_at: "2026-08-19T11:00:00Z" });
    await seedLocation(truckId, { starts_at: "2026-08-19T15:00:00Z", ends_at: "2026-08-19T17:00:00Z" });
    await seedLocation(truckId, { starts_at: "2026-08-12T10:00:00Z", ends_at: "2026-08-12T12:00:00Z" });

    const { day, suggestions } = await getChecklist(NOW);

    expect(day).toBe("2026-08-26");
    expect(windows(ofTruck(suggestions, truckId))).toEqual([
      [Date.parse("2026-08-26T09:00:00Z"), Date.parse("2026-08-26T11:00:00Z")],
      [Date.parse("2026-08-26T15:00:00Z"), Date.parse("2026-08-26T17:00:00Z")],
    ]);
  });

  it("skips a week with only a cancelled entry, and looks back four weeks and no further", async () => {
    const fallsBack = await seedTruck("Inställd vecka");
    await seedLocation(fallsBack, {
      starts_at: "2026-08-19T09:00:00Z",
      ends_at: "2026-08-19T11:00:00Z",
      cancelled_at: "2026-08-19T06:00:00Z",
    });
    await seedLocation(fallsBack, { starts_at: "2026-07-29T10:00:00Z", ends_at: "2026-07-29T12:00:00Z" });
    const tooOld = await seedTruck("Fem veckor");
    await seedLocation(tooOld, { starts_at: "2026-07-22T09:00:00Z", ends_at: "2026-07-22T11:00:00Z" });

    const { suggestions } = await getChecklist(NOW);

    expect(windows(ofTruck(suggestions, fallsBack))).toEqual([
      [Date.parse("2026-08-26T10:00:00Z"), Date.parse("2026-08-26T12:00:00Z")],
    ]);
    expect(ofTruck(suggestions, tooOld)).toEqual([]);
  });

  it("suggests nothing for an inactive truck", async () => {
    const inactive = await seedTruck("Vilande", false);
    await seedLocation(inactive, { starts_at: "2026-08-19T09:00:00Z", ends_at: "2026-08-19T11:00:00Z" });

    expect(ofTruck((await getChecklist(NOW)).suggestions, inactive)).toEqual([]);
  });

  it("leaves out an ended suggestion and one overlapping the truck's entry today, not another truck's", async () => {
    const busy = await seedTruck("Redan ute");
    await seedLocation(busy, { starts_at: "2026-08-19T05:00:00Z", ends_at: "2026-08-19T05:30:00Z" });
    await seedLocation(busy, { starts_at: "2026-08-19T09:00:00Z", ends_at: "2026-08-19T11:00:00Z" });
    await seedLocation(busy, { starts_at: "2026-08-19T15:00:00Z", ends_at: "2026-08-19T17:00:00Z" });
    await seedLocation(busy, { starts_at: "2026-08-26T10:00:00Z", ends_at: "2026-08-26T10:30:00Z" });
    const free = await seedTruck("Ledig");
    await seedLocation(free, { starts_at: "2026-08-19T09:00:00Z", ends_at: "2026-08-19T11:00:00Z" });

    const { suggestions } = await getChecklist(NOW);

    // 07:00–07:30 has ended at 08:00; 11:00–13:00 overlaps today's 12:00–12:30.
    expect(windows(ofTruck(suggestions, busy))).toEqual([
      [Date.parse("2026-08-26T15:00:00Z"), Date.parse("2026-08-26T17:00:00Z")],
    ]);
    expect(ofTruck(suggestions, free)).toHaveLength(1);
  });
});
