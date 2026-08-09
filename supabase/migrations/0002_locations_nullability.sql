-- 0002_locations_nullability.sql
-- Reconcile `locations` column nullability with src/lib/types.ts (issue #49).
--
-- 0001 declared six columns nullable that the app types as non-null. The Phase 4
-- marker logic (deriveColor, the >= 0.45 display threshold, the cron's expires_at
-- sweep) all dereference these without a null check, so the DB — not the reader —
-- is the right place to guarantee presence. Tightening the schema is preferred
-- over widening the types: every one of these columns IS always computed at
-- insert time, so a null here would mean a service bug, and the constraint turns
-- that bug into a loud write failure instead of a silently mis-coloured marker.
--
-- Safe without a backfill: `locations` is written for the first time in Phase 3,
-- so the table is empty in every environment (seed.sql inserts trucks only).
--
-- Deliberately left NULLABLE (types.ts already agrees):
--   post_id           — a manual dashboard post has no originating posts row
--   address_raw       — structured dashboard input may carry no raw string
--   address_geocoded  — Nominatim may not return a canonical address
--   ends_at           — the expiry rule explicitly handles "no ends_at extracted"
--                       via the posted_at + 8h fallback, so absence is meaningful

-- Always set by the ingestion service — the lane that produced the row.
alter table locations alter column source set not null;

-- Always computed: confidence = parser_confidence × source_confidence, and the
-- source_confidence term is a constant per lane (manual 1.0 / webhook 0.85 /
-- email 0.55). None of the three can legitimately be absent.
alter table locations alter column confidence        set not null;
alter table locations alter column parser_confidence set not null;
alter table locations alter column source_confidence set not null;

-- Has `default false` since 0001 — the constraint just stops an explicit null.
alter table locations alter column is_negation set not null;

-- Always computed at insert: ends_at, else posted_at + 8h, hard-capped at
-- midnight. The cron cleanup filters on it, so a null row would never expire.
alter table locations alter column expires_at set not null;

-- Both carry `default now()`; the constraint stops an explicit null overriding it.
alter table locations alter column created_at set not null;
alter table locations alter column updated_at set not null;

-- Mirror the corpus-integrity approach already used on posts.source: pin the
-- three-value lane union from types.ts (Location["source"]) at the DB level, so a
-- service bug can't persist a lane the app has no confidence value for. Note this
-- is the LANE (3 values), not posts.source's finer-grained platform (6 values).
alter table locations add constraint locations_source_check
  check (source in ('manual', 'webhook', 'email'));
