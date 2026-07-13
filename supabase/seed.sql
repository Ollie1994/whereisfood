-- seed.sql — dev-only seed data (loaded by `supabase db reset` / first `supabase start`).
-- NOT production data. Fixed UUIDs so curl commands are copy-pasteable and stable
-- across resets (Open Decision #6: fixed UUIDs).
--
-- Fixed truck_ids for Phase 2 curl testing:
--   11111111-1111-1111-1111-111111111111  Burgarbilen        (active)
--   22222222-2222-2222-2222-222222222222  Taco Loco Göteborg (active)
--   33333333-3333-3333-3333-333333333333  Vintervilan        (INACTIVE — rejection tests)

insert into trucks (id, name, instagram_handle, cuisine_type, description, is_active, last_known_latitude, last_known_longitude)
values
  ('11111111-1111-1111-1111-111111111111', 'Burgarbilen', 'burgarbilen_gbg', 'Burgare',
   'Handgjorda burgare med råvaror från Saluhallen.', true, 57.6997, 11.9540),

  ('22222222-2222-2222-2222-222222222222', 'Taco Loco Göteborg', 'tacoloco_gbg', 'Mexikansk',
   'Tacos, quesadillas och churros mitt i stan.', true, 57.7028, 11.9668),

  ('33333333-3333-3333-3333-333333333333', 'Vintervilan', 'vintervilan', 'Husmanskost',
   'Klassisk husmanskost. Vintervila — öppnar igen till våren.', false, 57.7089, 11.9746)
on conflict (id) do nothing;
