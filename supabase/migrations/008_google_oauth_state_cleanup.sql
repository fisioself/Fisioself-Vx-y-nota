-- Add a safe cleanup helper for expired or already consumed OAuth states.
-- Run after 007_clinic_tenancy_hardening.sql.

create or replace function public.cleanup_google_oauth_states()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.google_oauth_states
  where expires_at < now() - interval '1 day'
     or consumed_at < now() - interval '1 day';

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.cleanup_google_oauth_states() from public;
grant execute on function public.cleanup_google_oauth_states() to service_role;

create extension if not exists pg_cron with schema extensions;

do $$
begin
  if exists (
    select 1
    from information_schema.schemata
    where schema_name = 'cron'
  )
  and not exists (
    select 1
    from cron.job
    where jobname = 'cleanup-google-oauth-states-daily'
  ) then
    perform cron.schedule(
      'cleanup-google-oauth-states-daily',
      '17 3 * * *',
      'select public.cleanup_google_oauth_states();'
    );
  end if;
end;
$$;
