-- run: rls
-- setup-fails: permission denied for table locations

revoke select on table locations from service_role;
