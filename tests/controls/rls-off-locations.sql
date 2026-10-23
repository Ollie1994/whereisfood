-- run: rls
-- green: no API role but service_role holds a privilege on locations (the grants), and service_role bypasses RLS

alter table locations disable row level security;
