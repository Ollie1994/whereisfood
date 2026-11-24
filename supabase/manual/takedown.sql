-- The takedown (Phase 10 plan, step 6; Phase 5 plan #7): removes one truck and its whole
-- history, to honour a removal request. Manual SQL, never app code (CLAUDE.md, "db layer").
-- How to run it, and the takedown log to keep after: RUNBOOK.md, "Takedown".
--
-- Its two inputs, in `input` below, keeping the quotes: TRUCK_ID, the truck's id, and
-- TRUCK_NAME, its name exactly as `trucks.name` holds it (a quote in it doubled). Both must
-- match one truck, so an id and a name from different trucks change nothing; two trucks with
-- the same name are told apart only by the id (RUNBOOK.md, "Takedown", steps 1 and 2). Left
-- as it is, TRUCK_ID isn't a uuid, so the statement fails (22P02) and changes nothing.
--
-- One statement, so all of it happens or none: the truck's locations deleted, each `users`
-- row pointing at it cleared (`truck_id` set to null: the account stays, as deleting one is
-- the Owners phase's), then the truck. `locations.truck_id` and `users.truck_id` are NO
-- ACTION, which Postgres checks at the end of the statement, so the truck's delete passes
-- beside its rows' deletes (probed on the local stack, IS #453: a truck with one location,
-- in one statement like this, deleted both; the truck's delete alone failed 23503,
-- `locations_truck_id_fkey`). A row in another table pointing at the truck fails the
-- statement with 23503, and nothing is changed (`takedown.test.ts`).
--
-- It returns one row: `result`, the truck's name, and how many locations, `users` pointers
-- and trucks it removed. `result` is one of:
--   taken down
--   the name does not match this id: nothing changed   (`truck` shows the name it has)
--   no truck with this id: nothing changed             (a truck already taken down too)
with input as (
  select 'TRUCK_ID'::uuid as id, 'TRUCK_NAME'::text as name
),
by_id as (
  select trucks.id, trucks.name from trucks join input on trucks.id = input.id
),
target as (
  select by_id.id, by_id.name from by_id join input on by_id.name = input.name
),
deleted_locations as (
  delete from locations where truck_id in (select id from target) returning id
),
cleared_users as (
  update users set truck_id = null where truck_id in (select id from target) returning id
),
deleted_truck as (
  delete from trucks where id in (select id from target) returning id
)
select
  case
    when exists (select 1 from target) then 'taken down'
    when exists (select 1 from by_id) then 'the name does not match this id: nothing changed'
    else 'no truck with this id: nothing changed'
  end as result,
  (select name from by_id) as truck,
  (select count(*) from deleted_locations) as locations_deleted,
  (select count(*) from cleared_users) as users_cleared,
  (select count(*) from deleted_truck) as trucks_deleted;
