import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFixtureUser, localSql, resetTables, seedLocation, seedTruck } from "./helpers";

// `supabase/manual/takedown.sql` (Phase 10 plan, step 6), run as written through `psql` on
// the local stack, with its one input, 'TRUCK_ID', replaced by a fixture truck's id.

const FILE = readFileSync(new URL("../../supabase/manual/takedown.sql", import.meta.url), "utf8");
const PLACEHOLDER = "'TRUCK_ID'";

// The file run on `truckId`: its one row's columns (`localSql` gives psql's unaligned output,
// `|`-separated): result, truck, locations_deleted, users_cleared, trucks_deleted.
function takedown(truckId: string): string[] {
  if (FILE.split(PLACEHOLDER).length !== 2) throw new Error(`takedown.sql: not exactly one ${PLACEHOLDER}`);
  return localSql(FILE.replace(PLACEHOLDER, `'${truckId}'`)).split("|");
}

const count = (sql: string) => Number(localSql(`select count(*) from ${sql}`));

// The whole of the three tables the file writes, to show a run changed nothing.
const snapshot = () => ({
  trucks: count("trucks"),
  locations: count("locations"),
  pointers: count("users where truck_id is not null"),
});

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

    expect(takedown(target)).toEqual(["taken down", "itest-fixture-Takedown target", "2", "1", "1"]);

    expect(count(`trucks where id = '${target}'`)).toBe(0);
    expect(count(`locations where truck_id = '${target}'`)).toBe(0);
    // The account stays, pointing at no truck.
    expect(localSql(`select coalesce(truck_id::text, 'null') from users where id = '${owner}'`)).toBe("null");

    expect(count(`trucks where id = '${bystander}'`)).toBe(1);
    expect(count(`locations where truck_id = '${bystander}'`)).toBe(2);
    expect(localSql(`select truck_id from users where id = '${bystanderOwner}'`)).toBe(bystander);
  });

  it("changes nothing for an id that is no truck, and says so", async () => {
    await seedLocation(await seedTruck("Takedown other"));
    const before = snapshot();
    expect(takedown(randomUUID())).toEqual(["no truck with this id: nothing changed", "", "0", "0", "0"]);
    expect(snapshot()).toEqual(before);
  });

  it("fails and changes nothing when run with its placeholder left in", async () => {
    await seedLocation(await seedTruck("Takedown unedited"));
    const before = snapshot();
    expect(() => localSql(FILE)).toThrow(/invalid input syntax for type uuid: "TRUCK_ID"/);
    expect(snapshot()).toEqual(before);
  });
});
