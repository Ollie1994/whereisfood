-- run: schema
-- red: NOT NULL > locations.updated_at refuses NULL with 23502

alter table locations alter column updated_at drop not null;
