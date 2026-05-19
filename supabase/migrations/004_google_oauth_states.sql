-- Temporary OAuth state table for Google Calendar authorization.
-- Run after 003_google_calendar.sql.

create table if not exists google_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

alter table google_oauth_states enable row level security;

create policy "google oauth state own read" on google_oauth_states
  for select to authenticated
  using (user_id = auth.uid());

create index if not exists google_oauth_states_expires_at_idx on google_oauth_states(expires_at);
