-- run: schema
-- red: foreign keys and the unique Instagram handle (decisions #7, #8) > refuses a second truck with the same instagram_handle with 23505

alter table trucks drop constraint trucks_instagram_handle_key;
