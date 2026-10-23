-- run: schema
-- red: the updated_at trigger and created_by (decision #5) > leaves updated_at when deleting the author sets created_by to NULL

drop trigger locations_updated_at on locations;
create trigger locations_updated_at before update on locations for each row
  execute procedure extensions.moddatetime (updated_at);
