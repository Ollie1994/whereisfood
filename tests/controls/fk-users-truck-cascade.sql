-- run: schema
-- red: foreign keys and the unique Instagram handle (decisions #7, #8) > refuses deleting a truck a users row points at with 23503

alter table users drop constraint users_truck_id_fkey;
alter table users add constraint users_truck_id_fkey foreign key (truck_id) references trucks (id) on delete cascade;
