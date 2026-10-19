// ⚠ POSTGREST RETURNS AT MOST `max_rows` ROWS (1000 in `supabase/config.toml`) WITH NO
// ERROR, so a read without a `limit` can come back cut short. A read that selects with
// `{ count: "exact" }` passes its rows and that count here, and gets an error instead
// of a partial list (`db-locations.test.ts` and `db-trucks.test.ts`, the max_rows tests).
export function assertAllRows(fn: string, rows: readonly unknown[], count: number | null): void {
  if (count !== rows.length) {
    throw new Error(
      `${fn}: ${rows.length} of ${count} rows returned (the API's max_rows); narrow the query`,
    );
  }
}
