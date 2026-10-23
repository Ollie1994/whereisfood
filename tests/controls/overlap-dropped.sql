-- run: schema
-- red: the overlap exclusion constraint > refuses an overlapping live window for the same truck with 23P01

alter table locations drop constraint locations_no_overlap;
