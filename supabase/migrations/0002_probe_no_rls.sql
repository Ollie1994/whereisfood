-- Probe for IS #290, never merged: a public table with RLS off that anon can read.
-- Security advisor's rls_disabled_in_public should report it as ERROR.
create table public.probe_no_rls (id bigint primary key);
grant select on table public.probe_no_rls to anon;
