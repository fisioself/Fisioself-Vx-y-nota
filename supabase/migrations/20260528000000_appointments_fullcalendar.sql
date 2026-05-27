-- Migration to add fields for FullCalendar and Google Calendar 2-way sync support

alter table public.appointments
  add column if not exists color_id text,
  add column if not exists session_type text;
