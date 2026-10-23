-- run: rls
-- red: service_role > reads and writes locations

revoke update on table locations from service_role;
