-- run: schema
-- red: the updated_at trigger > an edit moves updated_at and leaves created_at
-- red: the updated_at trigger > a cancel moves updated_at and leaves created_at
-- red: the updated_at trigger and created_by (decision #5) > moves updated_at on an edit of a row that has an author
-- red: the updated_at trigger and created_by (decision #5) > moves updated_at on an edit that also sets a NULL created_by to a user

drop trigger locations_updated_at on locations;
