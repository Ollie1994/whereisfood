-- 0003_default_column_nullability.sql
-- Extend the 0002 nullability reconciliation to the remaining tables (issue #48).
--
-- Why this is needed for #48 and not just cosmetic: #48 parameterizes the Supabase
-- clients with the GENERATED `Database` types so drift is caught by the compiler.
-- That only works if the generated Row types actually match src/lib/types.ts. They
-- did not — every column below carries a DEFAULT but was left nullable in 0001, so
-- `supabase gen types` emitted e.g. `trucks.is_active: boolean | null` against
-- types.ts's `is_active: boolean`, and the `as Truck` cast could not be removed.
--
-- A column with a DEFAULT is never null unless something explicitly writes null,
-- which for all of these would be a bug. Same reasoning as 0002: make the DB
-- enforce what the app already assumes.
--
-- Safe without a backfill: all defaults are already populated on existing rows
-- (`default now()` / `default true` / `default false` applied at insert time), so
-- SET NOT NULL validates against real data without rewriting it.

-- trucks — is_active gates every public read; created_at is audit metadata.
alter table trucks alter column is_active  set not null;
alter table trucks alter column created_at set not null;

-- posts — the permanent ML corpus. 0001 already made source/posted_at/raw_json/
-- parsing_status NOT NULL for exactly this reason; created_at was the one gap.
alter table posts alter column created_at set not null;

-- geocoding_cache — cached_at drives any future cache-invalidation policy.
alter table geocoding_cache alter column cached_at set not null;

-- users — is_admin is an authorization input; a null would be neither true nor
-- false in a boolean test and could silently skip an admin check.
alter table users alter column is_admin   set not null;
alter table users alter column created_at set not null;
