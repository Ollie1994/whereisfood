-- run: schema
-- red: the updated_at trigger and created_by (decision #5) > moves updated_at on an edit of a row that has an author

drop trigger locations_updated_at on locations;
create trigger locations_updated_at before update on locations for each row
  when (old.created_by is null)
  execute procedure extensions.moddatetime (updated_at);
