-- run: schema
-- red: NOT NULL > locations.longitude refuses NULL with 23502

alter table locations alter column longitude drop not null;
