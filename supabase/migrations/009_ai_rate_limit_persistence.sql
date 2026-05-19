-- Persist AI rate limits per user across Edge Function instances.
-- Run after 008_google_oauth_state_cleanup.sql.

create table if not exists ai_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

alter table ai_rate_limits enable row level security;

create or replace function public.check_ai_rate_limit(
  target_user_id uuid,
  window_seconds integer default 60,
  max_requests integer default 12
)
returns table(allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.ai_rate_limits%rowtype;
  elapsed_seconds integer;
begin
  if target_user_id is null then
    return query select false, window_seconds;
    return;
  end if;

  insert into public.ai_rate_limits (user_id, window_start, request_count, updated_at)
  values (target_user_id, now(), 0, now())
  on conflict (user_id) do nothing;

  select *
  into current_row
  from public.ai_rate_limits
  where user_id = target_user_id
  for update;

  elapsed_seconds := greatest(0, extract(epoch from now() - current_row.window_start)::integer);

  if elapsed_seconds >= window_seconds then
    update public.ai_rate_limits
    set window_start = now(),
        request_count = 1,
        updated_at = now()
    where user_id = target_user_id;

    return query select true, 0;
    return;
  end if;

  if current_row.request_count >= max_requests then
    return query select false, greatest(1, window_seconds - elapsed_seconds);
    return;
  end if;

  update public.ai_rate_limits
  set request_count = request_count + 1,
      updated_at = now()
  where user_id = target_user_id;

  return query select true, 0;
end;
$$;

revoke all on ai_rate_limits from public;
revoke all on function public.check_ai_rate_limit(uuid, integer, integer) from public;
grant execute on function public.check_ai_rate_limit(uuid, integer, integer) to service_role;

create index if not exists ai_rate_limits_updated_at_idx on ai_rate_limits(updated_at);
