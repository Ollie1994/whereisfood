-- run: schema
-- red: the updated_at trigger > an edit moves updated_at and leaves created_at
-- red: the updated_at trigger > a cancel moves updated_at and leaves created_at

create trigger locations_created_at before update on locations for each row
  execute procedure extensions.moddatetime (created_at);
