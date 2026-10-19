-- 0001_baseline.sql
-- Foodtruck Map Gothenburg: the whole schema in one file. It replaced 0001–0006 of the
-- old three-lane design (Phase 5 plan, decision #3); those are on the
-- `archive/parser-lanes` tag. Rationale for each choice: the plan's decisions, cited
-- as #n below.

-- ---------------------------------------------------------------------------
-- Extensions (#5): both in `extensions`, so no function of theirs lands in `public`.
-- ---------------------------------------------------------------------------

-- btree_gist: the GiST equality operator on uuid that the exclusion constraint needs.
create extension if not exists btree_gist schema extensions;
-- moddatetime: the trigger function that keeps `locations.updated_at` current.
create extension if not exists moddatetime schema extensions;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

-- An enum rather than text with a CHECK, so the generated types carry
-- 'admin' | 'owner' (#18). A bad value raises 22P02 naming the type.
create type location_source as enum ('admin', 'owner');

-- ---------------------------------------------------------------------------
-- Tables. Every column's nullability and default is stated here (#17).
-- `locations.truck_id`, `users.truck_id` and `users.id` are NO ACTION: deleting a truck
-- with history fails with 23503 (probed on this schema 2026-10-19,
-- `locations_truck_id_fkey`), and only the takedown (Phase 8) removes history (#7).
-- `locations.created_by` is the exception, ON DELETE SET NULL (#8; the trigger below).
-- ---------------------------------------------------------------------------

create table trucks (
  id                uuid        primary key default gen_random_uuid(),
  -- Swedish collation, so `order by name` puts Å, Ä, Ö after Z (#19). The stack's
  -- default sorted `Åkes < Alpha < Ärtsoppan` (checked 2026-10-19).
  name              text        collate "sv-SE-x-icu" not null,
  instagram_handle  text        unique,
  cuisine_type      text,
  description       text,
  is_active         boolean     not null default true,
  created_at        timestamptz not null default now()
);

create table locations (
  id            uuid            primary key default gen_random_uuid(),
  truck_id      uuid            not null references trucks (id),
  -- No range CHECK: the Gothenburg box is the validator's (#13).
  latitude      float8          not null,
  longitude     float8          not null,
  -- Nullable: a pin dropped on the map may have no name (#12).
  label         text,
  starts_at     timestamptz     not null,
  ends_at       timestamptz     not null,
  -- NULL means live; set means cancelled. Rows are never deleted.
  cancelled_at  timestamptz,
  source        location_source not null default 'admin',
  -- Nullable for seed rows and hand-written SQL; never selected by the db layer (#8).
  created_by    uuid            references auth.users (id) on delete set null,
  created_at    timestamptz     not null default now(),
  updated_at    timestamptz     not null default now(),

  -- With ends_at = starts_at the range is empty and overlaps nothing, so the
  -- exclusion constraint alone would let the row in (#4).
  constraint locations_ends_after_starts check (ends_at > starts_at),

  -- Overlapping live windows for one truck raise 23P01. `[)` bounds: a window ending at
  -- 14:00 and one starting at 14:00 don't overlap. Cancelled rows are outside it (#4).
  constraint locations_no_overlap exclude using gist (
    truck_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (cancelled_at is null)
);

-- One row per admin or truck owner; consumers have none. `id` is the auth user's.
create table users (
  id          uuid        primary key references auth.users (id),
  truck_id    uuid        references trucks (id),
  is_admin    boolean     not null default false,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at trigger (#5)
-- Moves `updated_at` on every UPDATE except one that takes `created_by` from a value to
-- NULL, which is what `on delete set null` runs when an auth user is deleted; without
-- the WHEN clause that would mark every entry the user wrote as just updated.
-- ⚠ SQL that clears `created_by` while editing a row must set `updated_at = now()`
-- itself. The db layer never writes `created_by` on an update: `updateLocation` sends
-- only `LocationPatch`'s columns, picked at runtime (`src/lib/db/locations.ts`).
-- ---------------------------------------------------------------------------

create trigger locations_updated_at
  before update on locations
  for each row
  when (new.created_by is not null or old.created_by is null)
  execute procedure extensions.moddatetime (updated_at);

-- ---------------------------------------------------------------------------
-- Indexes (#14), one per read. The exclusion constraint's GiST index serves overlap
-- checks for one truck but can't return rows in `starts_at` order.
-- ---------------------------------------------------------------------------

-- The live window and the checklist (`findLocationsOverlapping`).
create index locations_live_ends_at on locations (ends_at)
  where cancelled_at is null;

-- "Recent places" (`listRecentLocationsForTruck`): reads `limit` rows off the index.
create index locations_live_truck_starts_at on locations (truck_id, starts_at desc)
  where cancelled_at is null;

-- ---------------------------------------------------------------------------
-- Row Level Security and grants (#6)
-- Each table: revoke everything from the three API roles, then grant exactly its row
-- of `project-context.md`'s "RLS and grants" table. The revoke is needed: on the local
-- stack `pg_default_acl` gives anon, authenticated and service_role TRUNCATE,
-- REFERENCES, TRIGGER and MAINTAIN on every new table in `public` (checked
-- 2026-10-18). No service_role policies: it bypasses RLS.
-- No anon access to `trucks` or `locations`: history is kept, and anon SELECT would
-- publish every truck's movement history through the Data API.
-- ---------------------------------------------------------------------------

alter table trucks enable row level security;
revoke all on table trucks from anon, authenticated, service_role;
grant select, insert, update, delete on table trucks to service_role;

alter table locations enable row level security;
revoke all on table locations from anon, authenticated, service_role;
grant select, insert, update, delete on table locations to service_role;

-- users: authenticated reads its own row. No UPDATE grant or policy: an UPDATE on
-- one's own row allows `is_admin` self-escalation and `truck_id` hijack. A future
-- profile field gets a column-scoped grant that never covers either.
alter table users enable row level security;
revoke all on table users from anon, authenticated, service_role;
grant select, insert, update, delete on table users to service_role;
grant select on table users to authenticated;
create policy users_select_own on users
  for select to authenticated
  using ((select auth.uid()) = id);
