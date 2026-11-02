-- seed.sql — dev-only seed data (loaded by `supabase db reset` / first `supabase start`).
-- NOT production data. Fixed truck UUIDs so curl commands are copy-pasteable and stable
-- across resets.
--
-- For an EMPTY database only (`npx supabase start` on a fresh stack, or
-- `npx supabase db reset`). Run again on a seeded database it fails: the trucks' ids
-- (23505) and the history's windows (23P01) are taken.
--
--   11111111-1111-1111-1111-111111111111  Burgarbilen        (active)
--   22222222-2222-2222-2222-222222222222  Taco Loco Göteborg (active)
--   33333333-3333-3333-3333-333333333333  Vintervilan        (INACTIVE — rejection tests)

insert into trucks (id, name, instagram_handle, cuisine_type, description, is_active)
values
  ('11111111-1111-1111-1111-111111111111', 'Burgarbilen', 'burgarbilen_gbg', 'Burgare',
   'Handgjorda burgare med råvaror från Saluhallen.', true),

  ('22222222-2222-2222-2222-222222222222', 'Taco Loco Göteborg', 'tacoloco_gbg', 'Mexikansk',
   'Tacos, quesadillas och churros mitt i stan.', true),

  ('33333333-3333-3333-3333-333333333333', 'Vintervilan', 'vintervilan', 'Husmanskost',
   'Klassisk husmanskost. Vintervila — öppnar igen till våren.', false);

-- History, relative to now() so it never ages out of the checklist's look-back (Phase 5
-- plan, decision #15): the 28 Stockholm days before today, ending yesterday, 11:00–14:00
-- Stockholm time. Taco Loco every day, so "the same weekday last week" always has a row;
-- Burgarbilen on weekdays. Vintervilan gets none: it is the inactive truck, and
-- `findLocationsOverlapping` doesn't filter on `is_active`.
--
-- ⚠ `d` is a `date`, and `(d + time '11:00') at time zone 'Europe/Stockholm'` reads that
-- wall-clock time as Stockholm's, so it stays 11:00 across a DST change. A `timestamptz`
-- in its place gives 13:00 UTC-as-local, then 12:00 after the change (Phase 5 plan, open
-- decision 3, which records the check of this expression on an anchor across a change).
with days as (
  select (now() at time zone 'Europe/Stockholm')::date - n as d
  from generate_series(1, 28) as n
)
insert into locations (truck_id, latitude, longitude, label, starts_at, ends_at)
select
  t.truck_id, t.latitude, t.longitude, t.label,
  (days.d + time '11:00') at time zone 'Europe/Stockholm',
  (days.d + time '14:00') at time zone 'Europe/Stockholm'
from days
cross join lateral (
  -- isodow: 1 = Monday … 7 = Sunday.
  select * from (values
    ('22222222-2222-2222-2222-222222222222'::uuid, 57.7043702::float8, 11.9697598::float8, 'Kungsportsplatsen'),
    ('11111111-1111-1111-1111-111111111111'::uuid,
     case when extract(isodow from days.d) in (2, 4) then 57.7024223 else 57.7066083 end,
     case when extract(isodow from days.d) in (2, 4) then 11.9789581 else 11.9409449 end,
     case when extract(isodow from days.d) in (2, 4) then 'Heden' else 'Lindholmen' end)
  ) as v (truck_id, latitude, longitude, label)
  where v.truck_id = '22222222-2222-2222-2222-222222222222'
     or extract(isodow from days.d) between 1 and 5
) as t;

-- One live row, so the live window [now, now + 1 day) is non-empty for 12 hours after a
-- reset at any time of day. The history stops at yesterday 14:00 Stockholm, so this row
-- can't overlap it.
insert into locations (truck_id, latitude, longitude, label, starts_at, ends_at)
values
  ('11111111-1111-1111-1111-111111111111', 57.6998935, 11.952503, 'Järntorget',
   now() - interval '1 hour', now() + interval '12 hours');
