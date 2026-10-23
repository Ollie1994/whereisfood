-- run: rls
-- red: service_role > reads and writes users

revoke update on table users from service_role;
