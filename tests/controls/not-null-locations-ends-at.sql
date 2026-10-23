-- run: schema
-- red: NOT NULL > locations.ends_at refuses NULL with 23502

alter table locations alter column ends_at drop not null;
