-- run: rls
-- red: anon > on trucks > is refused UPDATE
-- red: anon > on locations > is refused UPDATE
-- red: anon > on users > is refused UPDATE
-- red: authenticated > on trucks > is refused UPDATE
-- red: authenticated > on locations > is refused UPDATE
-- red: authenticated on users > is refused UPDATE of its own is_admin, and the row is unchanged
-- red: authenticated on users > is refused UPDATE of its own truck_id, and the row is unchanged

grant update on trucks, locations, users to anon, authenticated;
