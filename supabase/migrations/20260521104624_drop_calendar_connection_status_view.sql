-- Drop the calendar_connection_status view created in 005_google_oauth_token_hardening.sql.
--
-- Background: the view uses security_invoker=true, but 005 also dropped the
-- SELECT policy on calendar_connections, so any client query against the view
-- returns 0 rows. The view is dead code that nothing in the app reads, and it
-- pollutes the schema. Edge functions use the base table with the service role,
-- so removing the view has no functional impact.

drop view if exists public.calendar_connection_status;
