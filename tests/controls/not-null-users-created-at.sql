-- run: schema
-- red: NOT NULL > users.created_at refuses NULL with 23502

alter table users alter column created_at drop not null;
