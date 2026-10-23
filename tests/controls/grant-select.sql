-- run: rls
-- red: anon > on trucks > is refused SELECT
-- red: anon > on locations > is refused SELECT
-- red: anon > on users > is refused SELECT
-- red: authenticated > on trucks > is refused SELECT
-- red: authenticated > on locations > is refused SELECT

grant select on trucks, locations, users to anon;
grant select on trucks, locations to authenticated;
