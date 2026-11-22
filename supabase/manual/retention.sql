-- The weekly retention delete (Phase 10 plan, step 7 and #10): deletes the location history
-- and Auth audit-log rows past their periods. Manual SQL, never app code (CLAUDE.md, "db
-- layer"), run once a week after the dump.
--
-- The periods, the owner's calls on IS #454 (the plan's open decisions 2 and 3):
--   locations that ended more than 52 weeks ago. Cancelled ones go the same way, by
--     `ends_at`. The recent places come from a truck's last `RECENT_ENTRIES` entries that
--     aren't cancelled (`getRecentPlaces`, `src/lib/services/locations.ts`), so after a run
--     only from those that ended within the 52 weeks: a truck back from a shorter break still
--     has those, and one with none left has no recent places;
--   `auth.audit_log_entries` rows created more than 30 days ago, kept to investigate a
--     takeover. A row with no `created_at` is never deleted (none on the local stack,
--     IS #454).
--
-- One statement, so the SQL editor shows its one row (the preview's showed `0 | 0`, run whole
-- with nothing due, IS #454, 2026-11-20), and both deletes happen or neither.
-- It returns how many rows each delete removed. Nothing references `locations`, so its
-- delete has no foreign key to fail. `auth.audit_log_entries` has row-level security on, so
-- a role that may delete from it but has no BYPASSRLS and doesn't own it deletes none of its
-- rows with no error (one made so on the local stack: 0 rows). The preview's SQL editor runs
-- as `postgres`, which deleted one of them in a rolled-back probe (IS #454, 2026-11-20);
-- production's is #464's.
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
