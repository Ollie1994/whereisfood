import { randomUUID } from "node:crypto";
import type { PostgrestError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database, TablesUpdate } from "@/lib/database.types";
import { supabaseAdmin } from "@/lib/supabase";
import {
  FIXTURE_PLACE,
  FIXTURE_PREFIX,
  LUNCH_END,
  LUNCH_START,
  createFixtureAuthUser,
  dayWindow,
  readLocation,
  resetTables,
  seedLocation,
  seedTruck,
} from "./helpers";

// The baseline's integrity rules (Phase 5 plan, step 3; decisions #4, #5, #17, #18),
// tested against the database itself. Each error case asserts the SQLSTATE AND the
// constraint or column the message names: with the CHECK dropped, `ends_at < starts_at`
// still fails, with `22000` from building the constraint's range (decision #4), so
// "some error" would stay green. The PR records each case's negative control.

type Table = keyof Database["public"]["Tables"];

// Deliberately invalid rows go in typed loosely: the generated insert types reject the
// very NULLs and values these tests send.
async function insertError(table: Table, row: Record<string, unknown>): Promise<PostgrestError | null> {
  const { error } = await supabaseAdmin.from(table).insert(row as never);
  return error;
}

// A timestamp in microseconds. Postgres keeps microseconds and `Date.parse` only
// milliseconds, so two writes in one millisecond would compare equal under it. Throws on
// a format `Date.parse` can't read: NaN would pass `toBe(NaN)` and prove nothing.
function micros(timestamp: string): number {
  const fraction = /\.(\d+)/.exec(timestamp)?.[1] ?? "";
  const value =
    Date.parse(timestamp.replace(/\.\d+/, "")) * 1000 + Number(fraction.padEnd(6, "0").slice(0, 6));
  if (!Number.isFinite(value)) throw new Error(`micros: can't read "${timestamp}"`);
  return value;
}

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

  it("allows the same window on another truck", async () => {
    await seedLocation(truckId, { starts_at: LUNCH_START, ends_at: LUNCH_END });
    const otherTruck = await seedTruck("Other");

    expect(await insertError("locations", aLocationRow({ truck_id: otherTruck }))).toBeNull();
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
  // is refused first (23502), so no auth user is needed. With NOT NULL dropped, the
  // foreign key refuses the row instead (23503), and the test goes red.
  //
  // Each row carries its own `id`, and the test deletes it afterwards: a row that does
  // insert (a regression, or a control) may have no fixture truck to be found by, or no
  // fixture name (CLAUDE.md, Hard Rules › Supabase).
  const validRow = (table: Table): Record<string, unknown> & { id: string } => {
    switch (table) {
      case "trucks":
        return { id: randomUUID(), name: `${FIXTURE_PREFIX}NotNull` };
      case "locations":
        return {
          id: randomUUID(),
          truck_id: truckId,
          ...FIXTURE_PLACE,
          ...dayWindow(Date.UTC(2030, 0, 1)),
        };
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
    const row = validRow(table);
    let asserted = false;
    try {
      const error = await insertError(table, { ...row, [column]: null });

      expect(error).toMatchObject({ code: "23502" });
      expect(error?.message).toContain(`"${column}"`);
      asserted = true;
    } finally {
      // A cleanup error is thrown only when the assertions passed: thrown from here after
      // a failed assertion, it would replace that failure in the report.
      const { error } = await supabaseAdmin.from(table).delete().eq("id", row.id);
      if (error && asserted) throw error;
    }
  });
});

describe("the location_source enum", () => {
  it.each(["admin", "owner"])("accepts %s", async (source) => {
    // Decision #18's two values. A type recreated without one keeps the refusal below
    // green, so each value is inserted.
    expect(await insertError("locations", aLocationRow({ source }))).toBeNull();
  });

  it("refuses a value outside ('admin', 'owner') with 22P02 naming the enum", async () => {
    // 22P02 alone also comes from any malformed uuid, so the message must name the type.
    const error = await insertError("locations", aLocationRow({ source: "carrier-pigeon" }));

    expect(error).toMatchObject({ code: "22P02" });
    expect(error?.message).toContain("location_source");
  });
});

describe("the updated_at trigger", () => {
  async function update(id: string, values: TablesUpdate<"locations">) {
    const { data, error } = await supabaseAdmin
      .from("locations")
      .update(values)
      .eq("id", id)
      .select("created_at, updated_at")
      .single();
    if (error) throw error;
    return data;
  }

  it.each<[string, TablesUpdate<"locations">]>([
    ["an edit", { label: "Heden" }],
    ["a cancel", { cancelled_at: "2026-08-21T08:00:00.000Z" }],
  ])("%s moves updated_at and leaves created_at", async (_case, values) => {
    const row = await seedLocation(truckId);

    const after = await update(row.id, values);

    expect(micros(after.updated_at)).toBeGreaterThan(micros(row.updated_at));
    expect(micros(after.created_at)).toBe(micros(row.created_at));
  });
});

describe("the updated_at trigger and created_by (decision #5)", () => {
  it("leaves updated_at when deleting the author sets created_by to NULL", async () => {
    // `on delete set null` runs an UPDATE on every row the user wrote; without the
    // trigger's WHEN clause it would mark them all as just updated. The author is a bare
    // auth user: a `users` row would block the delete (`users.id` is NO ACTION).
    const author = await createFixtureAuthUser();
    const row = await seedLocation(truckId, { created_by: author });

    const { error } = await supabaseAdmin.auth.admin.deleteUser(author);
    if (error) throw error;
    const after = await readLocation(row.id);

    // The SET NULL ran, so the UPDATE the trigger saw happened.
    expect(after.created_by).toBeNull();
    expect(micros(after.updated_at)).toBe(micros(row.updated_at));
  });

  it("moves updated_at on an edit of a row that has an author", async () => {
    // Entries made in the admin screen will carry their author (decision #8; seed rows
    // and hand-written SQL don't), so this is the edit production will make. A clause
    // that fires only while `created_by` is NULL passes every other case here.
    const author = await createFixtureAuthUser();
    const row = await seedLocation(truckId, { created_by: author });

    const { error } = await supabaseAdmin.from("locations").update({ label: "Heden" }).eq("id", row.id);
    if (error) throw error;
    const after = await readLocation(row.id);

    expect(after.created_by).toBe(author);
    expect(micros(after.updated_at)).toBeGreaterThan(micros(row.updated_at));
  });

  it("moves updated_at on an edit that also sets a NULL created_by to a user", async () => {
    // The WHEN clause skips only an UPDATE that takes `created_by` from a value to NULL.
    // A clause skipping every UPDATE that changes `created_by` would skip this one too.
    const author = await createFixtureAuthUser();
    const row = await seedLocation(truckId);

    const { error } = await supabaseAdmin
      .from("locations")
      .update({ label: "Heden", created_by: author })
      .eq("id", row.id);
    if (error) throw error;
    const after = await readLocation(row.id);

    expect(after.created_by).toBe(author);
    expect(micros(after.updated_at)).toBeGreaterThan(micros(row.updated_at));
  });
});
