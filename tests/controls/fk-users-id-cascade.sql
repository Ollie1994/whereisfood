-- run: schema
-- red: foreign keys and the unique Instagram handle (decisions #7, #8) > refuses deleting an auth user that has a users row, and keeps both

alter table users drop constraint users_id_fkey;
alter table users add constraint users_id_fkey foreign key (id) references auth.users (id) on delete cascade;
