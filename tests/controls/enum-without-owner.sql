-- run: schema
-- red: the location_source enum > accepts owner

alter table locations alter column source drop default;
alter table locations alter column source type text using source::text;
alter table locations alter column source set default 'admin';
alter table locations add constraint source_admin_only check (source = 'admin');
