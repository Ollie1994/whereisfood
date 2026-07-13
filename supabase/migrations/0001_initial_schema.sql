-- 0001_initial_schema.sql
-- Foodtruck Map Gothenburg — authoritative initial schema.
-- Tables: trucks, geocoding_cache, posts, locations, users.
-- Matches .claude/context/project-context.md "Database Schema", "Indexes", "Row Level Security".
-- RLS is enabled + policies authored here, but not exercised until Phase 4 (all Phase 2
-- writes use the service role, which bypasses RLS).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- trucks — one row per food truck. last_known_lat/lng are denormalized, updated
-- by the ingestion service on each successful location insert (grey-marker default).
create table trucks (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  instagram_handle      text unique,
  cuisine_type          text,
  description           text,
  is_active             boolean default true,
  last_known_latitude   float8,
  last_known_longitude  float8,
  created_at            timestamptz default now()
);

-- geocoding_cache — address string → lat/lng, cached forever (Nominatim is 1 req/sec).
create table geocoding_cache (
  address_raw  text primary key,
  latitude     float8 not null,
  longitude    float8 not null,
  cached_at    timestamptz default now()
);

-- posts — raw incoming data, stored BEFORE parsing. Never purged: this is the ML
-- training corpus for the future parser replacement. raw_json keeps the full payload.
create table posts (
  id                uuid primary key default gen_random_uuid(),
  truck_id          uuid not null references trucks (id),
  instagram_post_id text,          -- no inline unique — see partial index below
  caption           text,
  source            text,          -- instagram | facebook | tiktok | email | manual | webhook
  posted_at         timestamptz,
  raw_json          jsonb,         -- never lose raw data
  parsing_status    text,          -- pending | parsed | failed | skipped
  created_at        timestamptz default now()
);

-- locations — parsed/structured truck locations shown on the map. Cleaned by cron.
create table locations (
  id                uuid primary key default gen_random_uuid(),
  truck_id          uuid not null references trucks (id),
  post_id           uuid references posts (id),
  latitude          float8 not null,
  longitude         float8 not null,
  address_raw       text,
  address_geocoded  text,
  starts_at         timestamptz not null,
  ends_at           timestamptz,
  source            text,          -- manual | webhook | email
  confidence        float4,
  parser_confidence float4,
  source_confidence float4,
  is_negation       boolean default false,
  expires_at        timestamptz,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- users — truck owners + admins (consumers are anonymous, no row). id is the
-- auth.users id; truck_id is null for admin users.
create table users (
  id          uuid primary key references auth.users (id),
  truck_id    uuid references trucks (id),
  is_admin    boolean default false,
  created_at  timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- Partial unique: allows multiple NULL instagram_post_id, blocks duplicate real IDs.
create unique index posts_instagram_post_id_unique
  on posts (instagram_post_id) where instagram_post_id is not null;

-- Override logic: find overlapping locations for a truck (multiple slots per day).
create index locations_truck_starts on locations (truck_id, starts_at, ends_at);

-- Cron cleanup: find all expired locations.
create index locations_expires on locations (expires_at);

-- Caption deduplication: recent posts per truck.
create index posts_truck_created on posts (truck_id, created_at);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- RLS on every table. All API/service writes use the service role, which bypasses
-- RLS; these policies first matter for anon reads in Phase 4. "Active" filtering
-- (is_active, expires_at) is done in the app query, not baked into RLS.
-- ---------------------------------------------------------------------------

-- trucks: everyone reads; only service_role writes.
alter table trucks enable row level security;
create policy trucks_select_public on trucks
  for select to anon, authenticated using (true);
create policy trucks_insert_service_role on trucks
  for insert to service_role with check (true);
create policy trucks_update_service_role on trucks
  for update to service_role using (true) with check (true);
create policy trucks_delete_service_role on trucks
  for delete to service_role using (true);

-- locations: everyone reads; only service_role writes (all writes via API routes).
alter table locations enable row level security;
create policy locations_select_public on locations
  for select to anon, authenticated using (true);
create policy locations_insert_service_role on locations
  for insert to service_role with check (true);
create policy locations_update_service_role on locations
  for update to service_role using (true) with check (true);
create policy locations_delete_service_role on locations
  for delete to service_role using (true);

-- posts: internal raw data — service_role only for all operations.
alter table posts enable row level security;
create policy posts_select_service_role on posts
  for select to service_role using (true);
create policy posts_insert_service_role on posts
  for insert to service_role with check (true);
create policy posts_update_service_role on posts
  for update to service_role using (true) with check (true);
create policy posts_delete_service_role on posts
  for delete to service_role using (true);

-- geocoding_cache: service_role only (select / insert / update — no delete).
alter table geocoding_cache enable row level security;
create policy geocoding_cache_select_service_role on geocoding_cache
  for select to service_role using (true);
create policy geocoding_cache_insert_service_role on geocoding_cache
  for insert to service_role with check (true);
create policy geocoding_cache_update_service_role on geocoding_cache
  for update to service_role using (true) with check (true);

-- users: authenticated read/update own row only; service_role inserts on invite.
alter table users enable row level security;
create policy users_select_own on users
  for select to authenticated using ((select auth.uid()) = id);
create policy users_update_own on users
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy users_insert_service_role on users
  for insert to service_role with check (true);

-- ---------------------------------------------------------------------------
-- Data API grants
-- RLS policies filter rows, but a role still needs table-level privileges to
-- reach a table at all. Modern Supabase does not auto-expose new tables to the
-- API roles (config `auto_expose_new_tables` unset = "not auto-exposed"), so
-- without these grants every policy above is unreachable dead code — the REST
-- API returns 401/403 for anon reads AND service_role writes. Grant to match
-- the documented access model; RLS still restricts which rows each role sees.
-- ---------------------------------------------------------------------------

-- service_role: full DML on every table (server-side workhorse for all API
-- routes / services; bypasses RLS but still requires the grants for the Data API).
grant select, insert, update, delete on all tables in schema public to service_role;

-- Public read surface — trucks + locations (rows further constrained by the
-- *_select_public policies; app query filters is_active / expires_at).
grant select on trucks, locations to anon, authenticated;

-- Truck owners read + update their own user row (RLS restricts to auth.uid() = id).
grant select, update on users to authenticated;
