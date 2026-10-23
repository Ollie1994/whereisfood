-- run: rls
-- red: service_role > reads and writes locations

revoke delete on table locations from service_role;
