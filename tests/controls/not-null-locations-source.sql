-- run: schema
-- red: NOT NULL > locations.source refuses NULL with 23502

alter table locations alter column source drop not null;
