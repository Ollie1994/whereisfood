-- run: schema
-- red: NOT NULL > trucks.created_at refuses NULL with 23502

alter table trucks alter column created_at drop not null;
