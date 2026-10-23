-- run: rls
-- red: service_role > reads and writes users

revoke delete on table users from service_role;
