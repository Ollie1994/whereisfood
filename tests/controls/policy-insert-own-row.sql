-- run: rls
-- red: authenticated on users > is refused INSERT of its own row with is_admin = true, when it has none
-- red: authenticated on users > is refused INSERT of a row for another auth user, which has none

grant insert on users to authenticated;
create policy users_insert_own on users for insert to authenticated with check (id = (select auth.uid()));
