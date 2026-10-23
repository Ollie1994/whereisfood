-- run: schema
-- red: NOT NULL > locations.latitude refuses NULL with 23502

alter table locations alter column latitude drop not null;
