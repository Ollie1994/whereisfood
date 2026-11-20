-- The weekly retention delete (Phase 10 plan, step 7 and #10): deletes the location history
-- and Auth audit-log rows past their periods. Manual SQL, never app code (CLAUDE.md, "db
-- layer"), run once a week after the dump.
--
-- The periods, the owner's calls on IS #454 (the plan's open decisions 2 and 3):
--   locations that ended more than 52 weeks ago: long enough that a truck back from a
--     seasonal break still has its recent places, its last entries however old
--     (`RECENT_ENTRIES`, `src/lib/services/locations.ts`). Cancelled ones go the same way;
--   `auth.audit_log_entries` rows created more than 30 days ago, kept to investigate a
--     takeover. A row with no `created_at` is never deleted (none on the local stack,
--     IS #454).
--
-- One statement, so the SQL editor shows its one row, and both deletes happen or neither.
-- It returns how many rows each delete removed. Nothing references `locations`, so its
-- delete has no foreign key to fail. `auth.audit_log_entries` has row-level security on, so
-- a role without BYPASSRLS would delete none of its rows with no error: the role the
-- dashboard's SQL editor runs as, and its delete of one row, are IS #454's preview probe.
--
-- `tests/integration/retention.test.ts` runs it on the local stack, as `postgres`.
with deleted_locations as (
  delete from locations where ends_at < now() - interval '52 weeks' returning 1
),
deleted_audit_entries as (
  delete from auth.audit_log_entries where created_at < now() - interval '30 days' returning 1
)
select
  (select count(*) from deleted_locations) as locations_deleted,
  (select count(*) from deleted_audit_entries) as audit_entries_deleted;
