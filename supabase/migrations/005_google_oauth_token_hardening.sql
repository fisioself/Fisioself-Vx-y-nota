-- Harden Google OAuth token exposure.
-- Run after 004_google_oauth_states.sql.

-- Do not allow frontend clients to SELECT raw OAuth tokens.
drop policy if exists "calendar connections own read" on calendar_connections;

-- Keep insert/update policies for controlled connection flow, but Edge Functions should be the primary writer.
-- Service role continues to bypass RLS for token refresh/sync.

create or replace view calendar_connection_status
with (security_invoker = true)
as
select
  id,
  user_id,
  provider,
  provider_account_email,
  calendar_id,
  connected_at,
  updated_at,
  token_expires_at is not null as has_token,
  refresh_token is not null as has_refresh_token
from calendar_connections;

-- View access still respects underlying table RLS because security_invoker=true.
-- No raw access_token or refresh_token is exposed here.
