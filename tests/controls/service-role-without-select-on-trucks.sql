-- run: rls
-- setup-fails: permission denied for table trucks

revoke select on table trucks from service_role;
