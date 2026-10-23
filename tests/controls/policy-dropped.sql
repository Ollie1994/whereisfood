-- run: rls
-- red: authenticated on users > reads its own row and no other

drop policy users_select_own on users;
