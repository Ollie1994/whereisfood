-- run: schema
-- red: NOT NULL > users.is_admin refuses NULL with 23502

alter table users alter column is_admin drop not null;
