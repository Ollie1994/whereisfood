-- run: schema
-- red: the updated_at trigger > an edit moves updated_at and leaves created_at
-- red: the updated_at trigger > a cancel moves updated_at and leaves created_at

drop trigger locations_updated_at on locations;
create trigger locations_updated_at before update on locations for each row
  when (new.created_by is not null)
  execute procedure extensions.moddatetime (updated_at);
