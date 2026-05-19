-- Google Calendar and clinical scheduling schema.
-- Run after 001_initial_schema.sql and 002_roles_rls_hardening.sql.

create table if not exists calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'google' check (provider in ('google')),
  provider_account_email text,
  calendar_id text not null default 'primary',
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, calendar_id)
);

create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  therapist_id uuid references therapists(id),
  created_by uuid default auth.uid() references auth.users(id),
  title text not null,
  description text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled', 'no_show')),
  google_calendar_id text,
  google_event_id text,
  google_html_link text,
  sync_status text not null default 'pending' check (sync_status in ('pending', 'synced', 'failed', 'disabled')),
  sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

alter table calendar_connections enable row level security;
alter table appointments enable row level security;

create policy "calendar connections own read" on calendar_connections
  for select to authenticated
  using (user_id = auth.uid());

create policy "calendar connections own insert" on calendar_connections
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "calendar connections own update" on calendar_connections
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "appointments clinical read" on appointments
  for select to authenticated
  using (public.is_active_clinical_user());

create policy "appointments clinician insert" on appointments
  for insert to authenticated
  with check (public.is_admin_or_therapist() and created_by = auth.uid());

create policy "appointments clinician update" on appointments
  for update to authenticated
  using (public.is_admin_or_therapist())
  with check (public.is_admin_or_therapist());

create index if not exists appointments_patient_id_idx on appointments(patient_id);
create index if not exists appointments_starts_at_idx on appointments(starts_at);
create index if not exists appointments_google_event_id_idx on appointments(google_event_id);
