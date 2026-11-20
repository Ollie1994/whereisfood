import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FIXTURE_PREFIX, localSql } from "./helpers";

// `supabase/manual/retention.sql` (Phase 10 plan, step 7), run as written through `psql` on
// the local stack.
//
// Its fixtures, the file and the reads after it run in one transaction that is rolled back,
// so a run changes nothing in the database, a broken copy of the file included: the file
// deletes from whole tables, the seed's rows and a developer's own among them. In one
// transaction `now()` is one instant, so the rows sit a second either side of each cut.

const FILE = readFileSync(new URL("../../supabase/manual/retention.sql", import.meta.url), "utf8");

const LOCATIONS_CUT = "now() - interval '52 weeks'";
const AUDIT_CUT = "now() - interval '30 days'";

// psql prints each select's row on its own line: the counts before, the file's row, the
// counts after, then the fixture ids still there.
function run() {
  const trucks = [randomUUID(), randomUUID()];
  const id = {
    endedBefore: randomUUID(),
    cancelledBefore: randomUUID(),
    // Started before the cut and ended after it: kept, as only `ends_at` counts.
    endedAfter: randomUUID(),
    auditBefore: randomUUID(),
    auditAfter: randomUUID(),
  };
  const location = (rowId: string, truck: string, starts: string, ends: string, cancelled = "null") =>
    `insert into locations (id, truck_id, latitude, longitude, starts_at, ends_at, cancelled_at)` +
    ` values ('${rowId}', '${truck}', 57.7, 11.97, ${starts}, ${ends}, ${cancelled});`;
  const audit = (rowId: string, created: string) =>
    `insert into auth.audit_log_entries (id, payload, created_at) values ('${rowId}', '{}', ${created});`;
  const counts = "select (select count(*) from locations), (select count(*) from auth.audit_log_entries);";
  const fixtureIds = Object.values(id)
    .map((rowId) => `'${rowId}'`)
    .join(", ");

  const lines = localSql(
    [
      "begin;",
      ...trucks.map((truck, n) => `insert into trucks (id, name) values ('${truck}', '${FIXTURE_PREFIX}Retention ${n}');`),
      location(id.endedBefore, trucks[0], `${LOCATIONS_CUT} - interval '1 hour'`, `${LOCATIONS_CUT} - interval '1 second'`),
      location(
        id.cancelledBefore,
        trucks[0],
        `${LOCATIONS_CUT} - interval '1 day'`,
        `${LOCATIONS_CUT} - interval '23 hours'`,
        `${LOCATIONS_CUT} - interval '2 days'`,
      ),
      location(id.endedAfter, trucks[1], `${LOCATIONS_CUT} - interval '1 hour'`, `${LOCATIONS_CUT} + interval '1 second'`),
      audit(id.auditBefore, `${AUDIT_CUT} - interval '1 second'`),
      audit(id.auditAfter, `${AUDIT_CUT} + interval '1 second'`),
      counts,
      FILE,
      counts,
      "select coalesce(string_agg(id::text, ',' order by id), '') from (" +
        ` select id from locations where id in (${fixtureIds})` +
        ` union all select id from auth.audit_log_entries where id in (${fixtureIds})) as kept;`,
      "rollback;",
    ].join("\n"),
  ).split("\n");

  if (lines.length !== 4) throw new Error(`retention.test: expected 4 lines from psql, got ${lines.length}`);
  const [before, reported, after] = lines.slice(0, 3).map((line) => line.split("|").map(Number));
  const kept = new Set(lines[3].split(",").filter(Boolean));
  return { id, before, reported, after, kept };
}

describe("retention.sql", () => {
  it("deletes locations that ended before the 52-week cut and audit rows before the 30-day one, keeps the rest, and counts what it deleted", () => {
    const { id, before, reported, after, kept } = run();

    expect(kept.has(id.endedBefore)).toBe(false);
    expect(kept.has(id.cancelledBefore)).toBe(false);
    expect(kept.has(id.endedAfter)).toBe(true);
    expect(kept.has(id.auditBefore)).toBe(false);
    expect(kept.has(id.auditAfter)).toBe(true);

    // Each count is the rows that left its table, the fixtures' and any others'.
    expect(reported).toEqual([before[0] - after[0], before[1] - after[1]]);
    expect(reported[0]).toBeGreaterThanOrEqual(2);
    expect(reported[1]).toBeGreaterThanOrEqual(1);
  });

  it("leaves both tables as they were, since the run is rolled back", () => {
    const counts = () => localSql("select (select count(*) from locations), (select count(*) from auth.audit_log_entries)");
    const beforeRun = counts();
    const { id } = run();
    expect(counts()).toBe(beforeRun);
    expect(localSql(`select count(*) from locations where id = '${id.endedAfter}'`)).toBe("0");
  });
});
