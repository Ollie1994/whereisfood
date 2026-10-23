import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";
import { supabaseAdmin } from "@/lib/supabase";
import {
  FIXTURE_PLACE,
  FIXTURE_PREFIX,
  anonClient,
  createFixtureAuthUser,
  dayWindow,
  resetTables,
  seedLocation,
  seedTruck,
  signedInClient,
} from "./helpers";

// The baseline's grants and its one policy (Phase 5 plan, step 4; decision #6), tested
// through the Data API as each role. The PR records each case's negative control.
//
// ⚠ A REFUSAL IS `42501` PLUS THE OPERATION'S OWN PRIVILEGE IN THE HINT. `42501` alone
// can't tell a missing grant from a wrong one: with a grant and no policy, INSERT gets
// `42501` "new row violates row-level security policy" with no hint, and a filtered
// UPDATE or DELETE granted without SELECT gets `42501` with the hint
// `GRANT SELECT ON …`. Only a missing grant of the operation itself puts it in the hint
// (probed on the local stack's Postgres 17.6, 2026-10-18 and 2026-10-23). If an upgrade
// drops the hint, these cases fail rather than pass (open decision 4).
//
// No `resetTables()` between cases: the fixtures below are made once, because each
// `signedInClient()` is a sign-in and local Auth rate-limits them (`helpers.ts`).
// `setup.ts`'s `afterAll` removes them after the file.

type Table = keyof Database["public"]["Tables"];
type Operation = "SELECT" | "INSERT" | "UPDATE" | "DELETE";
type Client = SupabaseClient<Database>;

const OPERATIONS: Operation[] = ["SELECT", "INSERT", "UPDATE", "DELETE"];

// The privileges a "permission denied" hint asks for: `GRANT SELECT, UPDATE ON
// public.locations TO anon;` gives ["SELECT", "UPDATE"]. None when there is no hint.
function privilegesInHint(error: PostgrestError | null): string[] {
  const listed = /GRANT (.+?) ON /.exec(error?.hint ?? "")?.[1];
  return listed === undefined ? [] : listed.split(", ");
}

function expectRefused(error: PostgrestError | null, operation: Operation): void {
  expect(error).toMatchObject({ code: "42501" });
  expect(privilegesInHint(error)).toContain(operation);
}

let anon: Client;
let me: { client: Client; userId: string };
let other: { client: Client; userId: string };
// Signed in with no `users` row: the one who could insert its own row as an admin.
let rowless: { client: Client; userId: string };
let truckId: string;
let locationId: string;

beforeAll(async () => {
  await resetTables();
  truckId = await seedTruck("Rls");
  locationId = (await seedLocation(truckId)).id;
  anon = anonClient();
  me = await signedInClient();
  other = await signedInClient();
  rowless = await signedInClient({ usersRow: false });
}, 30_000);

// A valid row for `table`, which `service_role` could insert: with the INSERT grant (a
// control), the case got the RLS message with no hint. Prefixed and on the fixture
// truck, so one that does insert is removed.
function newRow(table: Table): Record<string, unknown> {
  switch (table) {
    case "trucks":
      return { name: `${FIXTURE_PREFIX}Rls insert` };
    case "locations":
      return { truck_id: truckId, ...FIXTURE_PLACE, ...dayWindow(Date.UTC(2031, 0, 1)) };
    case "users":
      return { id: rowless.userId };
  }
}

// A change to an existing row, and that row's id. Filtered with `.eq("id", …)`: unfiltered,
// anon's UPDATE and DELETE on `locations` got `21000` ("… requires a WHERE clause"), not
// `42501` (probed 2026-10-23).
function target(table: Table): { id: string; change: Record<string, unknown> } {
  switch (table) {
    case "trucks":
      return { id: truckId, change: { name: `${FIXTURE_PREFIX}Rls renamed` } };
    case "locations":
      return { id: locationId, change: { label: "Heden" } };
    case "users":
      return { id: me.userId, change: { is_admin: true } };
  }
}

// Loosely typed, like `schema.test.ts`'s `insertError`: one function for every table.
async function attempt(client: Client, table: Table, operation: Operation) {
  const { id, change } = target(table);
  switch (operation) {
    case "SELECT":
      return client.from(table).select("id");
    case "INSERT":
      return client.from(table).insert(newRow(table) as never);
    case "UPDATE":
      return client.from(table).update(change as never).eq("id", id);
    case "DELETE":
      return client.from(table).delete().eq("id", id);
  }
}

describe.each<[string, () => Client, Table[]]>([
  ["anon", () => anon, ["trucks", "locations", "users"]],
  ["authenticated", () => me.client, ["trucks", "locations"]],
])("%s", (_role, client, tables) => {
  describe.each(tables)("on %s", (table) => {
    it.each(OPERATIONS)("is refused %s", async (operation) => {
      const { error } = await attempt(client(), table, operation);

      expectRefused(error, operation);
    });
  });
});

describe("authenticated on users", () => {
  // Read with `service_role`, to check what a refused write left behind.
  async function storedRow(id: string) {
    const { data, error } = await supabaseAdmin.from("users").select().eq("id", id).maybeSingle();
    if (error) throw error;
    return data;
  }

  it("reads its own row and no other", async () => {
    const { data, error } = await me.client.from("users").select("id");

    expect(error).toBeNull();
    expect(data).toEqual([{ id: me.userId }]);
  });

  it("gets no row when it asks for another user's", async () => {
    // Stays green under a policy that hides every row (the policy dropped, as a control);
    // the case above is the one that catches that.
    const { data, error } = await me.client.from("users").select("id").eq("id", other.userId);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("is refused INSERT of a row for another auth user, which has none", async () => {
    const { error } = await me.client.from("users").insert({ id: rowless.userId });

    expectRefused(error, "INSERT");
  });

  it("is refused INSERT of its own row with is_admin = true, when it has none", async () => {
    // Self-escalation. The caller has no row, so a primary-key conflict can't stop it:
    // only the missing grant does. Not one row for the caller afterwards.
    const { error } = await rowless.client
      .from("users")
      .insert({ id: rowless.userId, is_admin: true });

    expectRefused(error, "INSERT");
    expect(await storedRow(rowless.userId)).toBeNull();
  });

  it.each<[string, () => Record<string, unknown>]>([
    ["is_admin", () => ({ is_admin: true })],
    ["truck_id", () => ({ truck_id: truckId })],
  ])("is refused UPDATE of its own %s, and the row is unchanged", async (_column, change) => {
    const before = await storedRow(me.userId);

    const { error } = await me.client
      .from("users")
      .update(change() as never)
      .eq("id", me.userId);

    expectRefused(error, "UPDATE");
    expect(await storedRow(me.userId)).toEqual(before);
  });

  it("is refused DELETE of its own row, and the row is still there", async () => {
    const { error } = await me.client.from("users").delete().eq("id", me.userId);

    expectRefused(error, "DELETE");
    expect(await storedRow(me.userId)).not.toBeNull();
  });
});

describe("service_role", () => {
  // Reads and writes each table: decision #6 grants it all four and no policy, since
  // it bypasses RLS. Each case makes and removes its own row.
  it("reads and writes trucks", async () => {
    const id = await seedTruck("Rls service");

    const read = await supabaseAdmin.from("trucks").select("id").eq("id", id);
    const updated = await supabaseAdmin
      .from("trucks")
      .update({ cuisine_type: "Tacos" })
      .eq("id", id)
      .select("cuisine_type");
    const deleted = await supabaseAdmin.from("trucks").delete().eq("id", id).select("id");

    expect(read).toMatchObject({ error: null, data: [{ id }] });
    expect(updated).toMatchObject({ error: null, data: [{ cuisine_type: "Tacos" }] });
    expect(deleted).toMatchObject({ error: null, data: [{ id }] });
  });

  it("reads and writes locations", async () => {
    const inserted = await supabaseAdmin
      .from("locations")
      .insert({ truck_id: truckId, ...FIXTURE_PLACE, ...dayWindow(Date.UTC(2032, 0, 1)) })
      .select("id")
      .single();
    if (inserted.error) throw inserted.error;
    const { id } = inserted.data;

    const read = await supabaseAdmin.from("locations").select("id").eq("id", id);
    const updated = await supabaseAdmin
      .from("locations")
      .update({ label: "Heden" })
      .eq("id", id)
      .select("label");
    // Test cleanup through the API; the app never deletes a location (CLAUDE.md).
    const deleted = await supabaseAdmin.from("locations").delete().eq("id", id).select("id");

    expect(read).toMatchObject({ error: null, data: [{ id }] });
    expect(updated).toMatchObject({ error: null, data: [{ label: "Heden" }] });
    expect(deleted).toMatchObject({ error: null, data: [{ id }] });
  });

  it("reads and writes users", async () => {
    const id = await createFixtureAuthUser();

    const inserted = await supabaseAdmin.from("users").insert({ id }).select("id");
    const read = await supabaseAdmin.from("users").select("id").eq("id", id);
    const updated = await supabaseAdmin
      .from("users")
      .update({ truck_id: truckId })
      .eq("id", id)
      .select("truck_id");
    const deleted = await supabaseAdmin.from("users").delete().eq("id", id).select("id");

    expect(inserted).toMatchObject({ error: null, data: [{ id }] });
    expect(read).toMatchObject({ error: null, data: [{ id }] });
    expect(updated).toMatchObject({ error: null, data: [{ truck_id: truckId }] });
    expect(deleted).toMatchObject({ error: null, data: [{ id }] });
  });
});
