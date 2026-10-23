-- run: schema
-- red: NOT NULL > locations.starts_at refuses NULL with 23502

alter table locations alter column starts_at drop not null;
