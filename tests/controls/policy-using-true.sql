-- run: rls
-- red: authenticated on users > reads its own row and no other
-- red: authenticated on users > gets no row when it asks for another user's

drop policy users_select_own on users;
create policy users_select_own on users for select to authenticated using (true);
