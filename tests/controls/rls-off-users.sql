-- run: rls
-- red: authenticated on users > reads its own row and no other
-- red: authenticated on users > gets no row when it asks for another user's

alter table users disable row level security;
