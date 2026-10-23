-- run: rls
-- red: service_role > reads and writes trucks

revoke delete on table trucks from service_role;
