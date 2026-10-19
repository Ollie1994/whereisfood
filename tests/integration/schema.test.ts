import { randomUUID } from "node:crypto";
import type { PostgrestError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";
import { supabaseAdmin } from "@/lib/supabase";
import {
  FIXTURE_PLACE,
  FIXTURE_PREFIX,
  dayWindow,
  resetTables,
  seedLocation,
  seedTruck,
} from "./helpers";

// The baseline's integrity rules (Phase 5 plan, step 3; decisions #4, #5, #17, #18),
// tested against the database itself. Each error case asserts the SQLSTATE AND the
// constraint or column the message names: with the CHECK dropped, `ends_at < starts_at`
// still fails, with `22000` from building the constraint's range (decision #4), so
// "some error" would stay green. The PR records each case's negative control.

type Table = "trucks" | "locations" | "users";

// Deliberately invalid rows go in typed loosely: the generated insert types reject the
// very NULLs and values these tests send.
async function insertError(table: Table, row: Record<string, unknown>): Promise<PostgrestError | null> {
  const { error } = await supabaseAdmin.from(table).insert(row as never);
  return error;
}

const LUNCH_START = "2026-08-22T09:00:00.000Z";
const LUNCH_END = "2026-08-22T12:00:00.000Z";

let truckId: string;

beforeEach(async () => {
  await resetTables();
  truckId = await seedTruck();
});

function aLocationRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { truck_id: truckId, ...FIXTURE_PLACE, starts_at: LUNCH_START, ends_at: LUNCH_END, ...overrides };
}

describe("the overlap exclusion constraint", () => {
  it("refuses an overlapping live window for the same truck with 23P01", async () => {
    await seedLocation(truckId, { starts_at: LUNCH_START, ends_at: LUNCH_END });

    const error = await insertError(
      "locations",
      aLocationRow({ starts_at: "2026-08-22T11:00:00.000Z", ends_at: "2026-08-22T13:00:00.000Z" }),
    );

    expect(error).toMatchObject({ code: "23P01" });
    expect(error?.message).toContain("locations_no_overlap");
  });

  it("lets a window overlap a cancelled one", async () => {
    await seedLocation(truckId, {
      starts_at: LUNCH_START,
      ends_at: LUNCH_END,
      cancelled_at: "2026-08-21T08:00:00.000Z",
    });

    expect(await insertError("locations", aLocationRow())).toBeNull();
  });

  it("allows back-to-back windows: one ending at 12:00, the next starting at 12:00", async () => {
    await seedLocation(truckId, { starts_at: LUNCH_START, ends_at: LUNCH_END });

    expect(
      await insertError(
        "locations",
        aLocationRow({ starts_at: LUNCH_END, ends_at: "2026-08-22T15:00:00.000Z" }),
      ),
    ).toBeNull();
  });
});

describe("CHECK (ends_at > starts_at)", () => {
  it.each([
    ["ends_at = starts_at", LUNCH_START],
    ["ends_at < starts_at", "2026-08-22T08:00:00.000Z"],
  ])("refuses %s with 23514", async (_case, endsAt) => {
    const error = await insertError("locations", aLocationRow({ ends_at: endsAt }));

    expect(error).toMatchObject({ code: "23514" });
    expect(error?.message).toContain("locations_ends_after_starts");
  });
});

describe("NOT NULL", () => {
  // Every NOT NULL column of decision #17 except the `id` primary keys (a primary key
  // can't drop NOT NULL, so it has no negative control). Written out, not read from the
  // schema: a column that loses NOT NULL must turn a test red.
  //
  // A `users` row's `id` must reference an auth user; these random ids don't. The NULL
  // is refused first (23502), so no row and no auth user is needed. With NOT NULL
  // dropped, the foreign key refuses the row instead (23503), and the test goes red.
  const validRow = (table: Table): Record<string, unknown> => {
    switch (table) {
      case "trucks":
        return { name: `${FIXTURE_PREFIX}NotNull` };
      case "locations":
        return { truck_id: truckId, ...FIXTURE_PLACE, ...dayWindow(Date.UTC(2030, 0, 1)) };
      case "users":
        return { id: randomUUID() };
    }
  };

  it.each<[Table, string]>([
    ["trucks", "name"],
    ["trucks", "is_active"],
    ["trucks", "created_at"],
    ["locations", "truck_id"],
    ["locations", "latitude"],
    ["locations", "longitude"],
    ["locations", "starts_at"],
    ["locations", "ends_at"],
    ["locations", "source"],
    ["locations", "created_at"],
    ["locations", "updated_at"],
    ["users", "is_admin"],
    ["users", "created_at"],
  ])("%s.%s refuses NULL with 23502", async (table, column) => {
    const error = await insertError(table, { ...validRow(table), [column]: null });

    expect(error).toMatchObject({ code: "23502" });
    expect(error?.message).toContain(`"${column}"`);
  });
});

describe("the location_source enum", () => {
  it("refuses a value outside ('admin', 'owner') with 22P02 naming the enum", async () => {
    // 22P02 alone also comes from any malformed uuid, so the message must name the type.
    const error = await insertError("locations", aLocationRow({ source: "carrier-pigeon" }));

    expect(error).toMatchObject({ code: "22P02" });
    expect(error?.message).toContain("location_source");
  });
});

describe("the updated_at trigger", () => {
  async function update(id: string, values: Record<string, unknown>) {
    const { data, error } = await supabaseAdmin
      .from("locations")
      .update(values as never)
      .eq("id", id)
      .select("created_at, updated_at")
      .single();
    if (error) throw error;
    return data;
  }

  it.each([
    ["an edit", { label: "Heden" }],
    ["a cancel", { cancelled_at: "2026-08-21T08:00:00.000Z" }],
  ])("%s moves updated_at and leaves created_at", async (_case, values) => {
    const row = await seedLocation(truckId);

    const after = await update(row.id, values);

    expect(Date.parse(after.updated_at)).toBeGreaterThan(Date.parse(row.updated_at));
    expect(Date.parse(after.created_at)).toBe(Date.parse(row.created_at));
  });
});
