-- run: rls
-- red: anon > on trucks > is refused DELETE
-- red: anon > on locations > is refused DELETE
-- red: anon > on users > is refused DELETE
-- red: authenticated > on trucks > is refused DELETE
-- red: authenticated > on locations > is refused DELETE
-- red: authenticated on users > is refused DELETE of its own row, and the row is still there

grant delete on trucks, locations, users to anon, authenticated;
