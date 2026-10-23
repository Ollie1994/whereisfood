-- run: rls
-- green: no API role but service_role holds a privilege on trucks (the grants), and service_role bypasses RLS

alter table trucks disable row level security;
