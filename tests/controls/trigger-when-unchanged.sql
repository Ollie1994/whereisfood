-- run: schema
-- red: the updated_at trigger and created_by (decision #5) > moves updated_at on an edit that also sets a NULL created_by to a user

drop trigger locations_updated_at on locations;
create trigger locations_updated_at before update on locations for each row
  when (old.created_by is not distinct from new.created_by)
  execute procedure extensions.moddatetime (updated_at);
