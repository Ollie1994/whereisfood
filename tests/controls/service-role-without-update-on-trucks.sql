-- run: rls
-- red: service_role > reads and writes trucks

revoke update on table trucks from service_role;
