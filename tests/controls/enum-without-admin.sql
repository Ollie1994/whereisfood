-- run: schema
-- red: the location_source enum > accepts admin

-- The seed's rows are 'admin', so the CHECK needs the table empty.
delete from locations;
alter table locations alter column source drop default;
alter table locations alter column source type text using source::text;
alter table locations alter column source set default 'admin';
alter table locations add constraint source_owner_only check (source = 'owner');
