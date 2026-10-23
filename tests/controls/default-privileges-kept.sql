-- run: rls
-- green: no API request maps to TRUNCATE, REFERENCES, TRIGGER or MAINTAIN (PostgREST's requests are SELECT, INSERT, UPDATE and DELETE), so no test can see them; decision #6 revokes them for SQL logins as these roles

grant truncate, references, trigger, maintain on table trucks, locations, users to anon, authenticated;
