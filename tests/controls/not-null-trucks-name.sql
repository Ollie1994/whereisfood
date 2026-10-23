-- run: schema
-- red: NOT NULL > trucks.name refuses NULL with 23502

alter table trucks alter column name drop not null;
