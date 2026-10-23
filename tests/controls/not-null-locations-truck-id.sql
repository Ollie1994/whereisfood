-- run: schema
-- red: NOT NULL > locations.truck_id refuses NULL with 23502

alter table locations alter column truck_id drop not null;
