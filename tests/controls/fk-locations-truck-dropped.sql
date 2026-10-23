-- run: schema
-- red: foreign keys and the unique Instagram handle (decisions #7, #8) > refuses deleting a truck that has a location with 23503

alter table locations drop constraint locations_truck_id_fkey;
