-- Encrypt Google OAuth tokens at rest with pgsodium.
--
-- Background:
--   calendar_connections.access_token / refresh_token are stored plaintext.
--   RLS blocks the client from reading them (see migration 005), but anyone
--   with the service-role key or direct DB access can read every token. The
--   refresh_token in particular grants long-lived access to the connected
--   Google Calendar without needing the user's password.
--
-- Strategy:
--   * Use pgsodium deterministic AEAD with connection_id as associated data.
--   * Store ciphertext in *_enc bytea columns. The plaintext columns are
--     kept (nulled out) for one release as a reversibility safety net; a
--     follow-up migration drops them once edge functions are verified.
--   * Expose two SECURITY DEFINER RPCs (calendar_tokens_set / _get) that
--     edge functions invoke with the service role. Clients have no execute
--     grant on them.

create extension if not exists pgsodium with schema pgsodium;

-- Idempotent key creation. Re-running the migration is a no-op once the key
-- exists.
do $$
begin
  if not exists (select 1 from pgsodium.valid_key where name = 'fisioself_calendar_tokens') then
    perform pgsodium.create_key(
      key_type := 'aead-det',
      name := 'fisioself_calendar_tokens'
    );
  end if;
end $$;

alter table public.calendar_connections
  add column if not exists access_token_enc bytea,
  add column if not exists refresh_token_enc bytea;

-- Write path: encrypt and store. Service role only.
create or replace function public.calendar_tokens_set(
  p_connection_id uuid,
  p_access_token text,
  p_refresh_token text
)
returns void
language plpgsql
security definer
set search_path = public, pgsodium
as $$
declare
  v_key_id uuid;
  v_ad bytea;
begin
  select id into v_key_id from pgsodium.valid_key where name = 'fisioself_calendar_tokens';
  if v_key_id is null then
    raise exception 'Encryption key fisioself_calendar_tokens not found';
  end if;

  v_ad := convert_to(p_connection_id::text, 'utf8');

  update public.calendar_connections
    set access_token_enc = case
          when p_access_token is null then null
          else pgsodium.crypto_aead_det_encrypt(
            convert_to(p_access_token, 'utf8'),
            v_ad,
            v_key_id
          )
        end,
        refresh_token_enc = case
          when p_refresh_token is null then null
          else pgsodium.crypto_aead_det_encrypt(
            convert_to(p_refresh_token, 'utf8'),
            v_ad,
            v_key_id
          )
        end,
        access_token = null,
        refresh_token = null,
        updated_at = now()
    where id = p_connection_id;
end;
$$;

revoke all on function public.calendar_tokens_set(uuid, text, text) from public;
grant execute on function public.calendar_tokens_set(uuid, text, text) to service_role;

-- Read path: decrypt and return. Service role only. Returns NULLs for any
-- token that has not been encrypted yet (defensive against partial migration
-- state).
create or replace function public.calendar_tokens_get(p_connection_id uuid)
returns table (
  access_token text,
  refresh_token text
)
language plpgsql
security definer
set search_path = public, pgsodium
as $$
declare
  v_key_id uuid;
  v_ad bytea;
  v_row record;
begin
  select id into v_key_id from pgsodium.valid_key where name = 'fisioself_calendar_tokens';
  if v_key_id is null then
    raise exception 'Encryption key fisioself_calendar_tokens not found';
  end if;

  select access_token_enc, refresh_token_enc
    into v_row
    from public.calendar_connections
   where id = p_connection_id;

  if not found then return; end if;

  v_ad := convert_to(p_connection_id::text, 'utf8');

  access_token := case
    when v_row.access_token_enc is null then null
    else convert_from(
      pgsodium.crypto_aead_det_decrypt(v_row.access_token_enc, v_ad, v_key_id),
      'utf8'
    )
  end;

  refresh_token := case
    when v_row.refresh_token_enc is null then null
    else convert_from(
      pgsodium.crypto_aead_det_decrypt(v_row.refresh_token_enc, v_ad, v_key_id),
      'utf8'
    )
  end;

  return next;
end;
$$;

revoke all on function public.calendar_tokens_get(uuid) from public;
grant execute on function public.calendar_tokens_get(uuid) to service_role;

-- One-time data migration: encrypt any existing plaintext rows. Safe to re-run
-- because calendar_tokens_set is idempotent on the encrypted output.
do $$
declare
  v_row record;
begin
  for v_row in
    select id, access_token, refresh_token
      from public.calendar_connections
     where (access_token is not null or refresh_token is not null)
  loop
    perform public.calendar_tokens_set(v_row.id, v_row.access_token, v_row.refresh_token);
  end loop;
end $$;

-- Belt-and-suspenders: ensure no plaintext lingers after the loop. The
-- calendar_tokens_set RPC already nulls them, but a direct UPDATE here covers
-- the case where someone wrote plaintext between the loop and now (very
-- unlikely inside a single migration transaction, but cheap insurance).
update public.calendar_connections
   set access_token = null,
       refresh_token = null
 where access_token is not null or refresh_token is not null;

comment on column public.calendar_connections.access_token is
  'DEPRECATED: kept temporarily for migration rollback safety. Always NULL in production. Use calendar_tokens_set / calendar_tokens_get instead.';
comment on column public.calendar_connections.refresh_token is
  'DEPRECATED: kept temporarily for migration rollback safety. Always NULL in production. Use calendar_tokens_set / calendar_tokens_get instead.';
