-- run: rls
-- red: anon > on trucks > is refused INSERT
-- red: anon > on locations > is refused INSERT
-- red: anon > on users > is refused INSERT
-- red: authenticated > on trucks > is refused INSERT
-- red: authenticated > on locations > is refused INSERT
-- red: authenticated on users > is refused INSERT of a row for another auth user, which has none
-- red: authenticated on users > is refused INSERT of its own row with is_admin = true, when it has none

grant insert on trucks, locations, users to anon, authenticated;
