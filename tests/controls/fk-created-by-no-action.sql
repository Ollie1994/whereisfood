-- run: schema
-- red: the updated_at trigger and created_by (decision #5) > leaves updated_at when deleting the author sets created_by to NULL

alter table locations drop constraint locations_created_by_fkey;
alter table locations add constraint locations_created_by_fkey foreign key (created_by) references auth.users (id) on delete no action;
