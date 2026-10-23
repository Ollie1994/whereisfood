-- run: schema
-- red: NOT NULL > locations.created_at refuses NULL with 23502

alter table locations alter column created_at drop not null;
