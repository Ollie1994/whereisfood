-- run: schema
-- red: NOT NULL > trucks.is_active refuses NULL with 23502

alter table trucks alter column is_active drop not null;
