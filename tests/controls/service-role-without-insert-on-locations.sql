-- run: rls
-- setup-fails: permission denied for table locations

revoke insert on table locations from service_role;
