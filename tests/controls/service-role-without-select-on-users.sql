-- run: rls
-- red: service_role > reads and writes users

revoke select on table users from service_role;
