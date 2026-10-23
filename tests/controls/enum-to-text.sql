-- run: schema
-- red: the location_source enum > refuses a value outside ('admin', 'owner') with 22P02 naming the enum

alter table locations alter column source drop default;
alter table locations alter column source type text using source::text;
alter table locations alter column source set default 'admin';
