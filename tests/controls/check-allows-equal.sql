-- run: schema
-- red: CHECK (ends_at > starts_at) > refuses ends_at = starts_at with 23514

alter table locations drop constraint locations_ends_after_starts;
alter table locations add constraint locations_ends_after_starts check (ends_at >= starts_at);
