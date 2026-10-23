-- run: rls
-- red: authenticated on users > reads its own row and no other
-- red: authenticated on users > gets no row when it asks for another user's

revoke select on table users from authenticated;
