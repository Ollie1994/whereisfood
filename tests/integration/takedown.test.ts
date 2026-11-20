import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFixtureUser, localSql, resetTables, seedLocation, seedTruck } from "./helpers";

// `supabase/manual/takedown.sql` (Phase 10 plan, step 6), run as written through `psql` on
// the local stack, with its two inputs, 'TRUCK_ID' and 'TRUCK_NAME', replaced.

const FILE = readFileSync(new URL("../../supabase/manual/takedown.sql", import.meta.url), "utf8");

// The file with `placeholder` replaced by `value`, quoted; it must hold the placeholder once.
function fill(sql: string, placeholder: string, value: string): string {
  if (sql.split(placeholder).length !== 2) throw new Error(`takedown.sql: not exactly one ${placeholder}`);
  return sql.replace(placeholder, `'${value.replaceAll("'", "''")}'`);
}

// The file run on a truck's id and name: its one row's columns, result, truck,
// locations_deleted, users_cleared, trucks_deleted. `localSql` gives psql's unaligned output,
// `|`-separated, so a name holding `|` would split wrongly; the fixtures' names hold none.
function takedown(truckId: string, name: string): string[] {
  return localSql(fill(fill(FILE, "'TRUCK_ID'", truckId), "'TRUCK_NAME'", name)).split("|");
}

const count = (sql: string) => Number(localSql(`select count(*) from ${sql}`));

// The rows of the three tables the file writes, to show a run changed nothing: every truck's
// and location's id, and every `users` row's id with its `truck_id`, sorted, each table in its
// own slot, empty when the table is.
const snapshot = () =>
  localSql(
    "select concat(" +
      " coalesce((select string_agg(id::text, ',' order by id) from trucks), ''), ' / '," +
      " coalesce((select string_agg(id::text, ',' order by id) from locations), ''), ' / '," +
      " coalesce((select string_agg(id::text || ':' || coalesce(truck_id::text, '-'), ',' order by id) from users), ''))",
  );

const NAME = (name: string) => `itest-fixture-${name}`;

beforeAll(resetTables);
afterAll(resetTables);

describe("takedown.sql", () => {
  it("removes the truck, its locations and its users pointer, and leaves another truck as it was", async () => {
    const target = await seedTruck("Takedown target");
    const bystander = await seedTruck("Takedown bystander");
    await seedLocation(target);
    await seedLocation(target, { cancelled_at: "2001-01-01T00:00:00.000Z" });
    await seedLocation(bystander);
    await seedLocation(bystander);
    const owner = await createFixtureUser(target);
    const bystanderOwner = await createFixtureUser(bystander);

    expect(takedown(target, NAME("Takedown target"))).toEqual(["taken down", NAME("Takedown target"), "2", "1", "1"]);

    expect(count(`trucks where id = '${target}'`)).toBe(0);
    expect(count(`locations where truck_id = '${target}'`)).toBe(0);
    // The account stays, pointing at no truck.
    expect(localSql(`select coalesce(truck_id::text, 'null') from users where id = '${owner}'`)).toBe("null");

    expect(count(`trucks where id = '${bystander}'`)).toBe(1);
    expect(count(`locations where truck_id = '${bystander}'`)).toBe(2);
    expect(localSql(`select truck_id from users where id = '${bystanderOwner}'`)).toBe(bystander);
  });

  it("changes nothing for an id that is no truck, or a truck's id with another name, and says which", async () => {
    const other = await seedTruck("Takedown other");
    await seedLocation(other);
    await createFixtureUser(other);
    const before = snapshot();
    expect(takedown(randomUUID(), NAME("Takedown other"))).toEqual(["no truck with this id: nothing changed", "", "0", "0", "0"]);
    expect(takedown(other, NAME("Takedown another"))).toEqual([
      "the name does not match this id: nothing changed",
      NAME("Takedown other"),
      "0",
      "0",
      "0",
    ]);
    // The id filled in and TRUCK_NAME left as it is.
    expect(localSql(fill(FILE, "'TRUCK_ID'", other)).split("|")[0]).toBe("the name does not match this id: nothing changed");
    expect(snapshot()).toEqual(before);
  });

  it("fails before changing anything when run with its placeholders left in", async () => {
    await seedLocation(await seedTruck("Takedown unedited"));
    const before = snapshot();
    expect(() => localSql(FILE)).toThrow(/invalid input syntax for type uuid: "TRUCK_ID"/);
    expect(snapshot()).toEqual(before);
  });

  // A scratch table pointing at the truck, as a table added later and left out of the file
  // would. Split into separately committed statements, the file failed this case with a
  // location gone and the pointer cleared (the control on PR #470, round 1).
  it("fails with 23503 and changes nothing while another table points at the truck", async () => {
    const target = await seedTruck("Takedown blocked");
    await seedLocation(target);
    await createFixtureUser(target);
    localSql("drop table if exists takedown_test_ref");
    try {
      localSql("create table takedown_test_ref (truck_id uuid references trucks (id))");
      localSql(`insert into takedown_test_ref values ('${target}')`);
      const before = snapshot();
      expect(() => takedown(target, NAME("Takedown blocked"))).toThrow(/takedown_test_ref_truck_id_fkey/);
      expect(snapshot()).toEqual(before);
    } finally {
      localSql("drop table if exists takedown_test_ref");
    }
  });
});
