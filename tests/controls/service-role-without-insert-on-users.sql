-- run: rls
-- setup-fails: permission denied for table users

revoke insert on table users from service_role;
