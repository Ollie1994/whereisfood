-- run: rls
-- green: anon holds no privilege on users (the grants), so widening the policy from authenticated to public changes nothing anon can do

drop policy users_select_own on users;
create policy users_select_own on users for select to public using ((select auth.uid()) = id);
