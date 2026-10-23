-- run: rls
-- setup-fails: permission denied for table trucks

revoke insert on table trucks from service_role;
