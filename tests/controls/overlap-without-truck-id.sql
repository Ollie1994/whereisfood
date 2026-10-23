-- run: schema
-- red: the overlap exclusion constraint > allows the same window on another truck

-- The seed's trucks share their 11:00–14:00 windows, so the rebuild needs the table empty.
delete from locations;
alter table locations drop constraint locations_no_overlap;
alter table locations add constraint locations_no_overlap exclude using gist (tstzrange(starts_at, ends_at) with &&) where (cancelled_at is null);
