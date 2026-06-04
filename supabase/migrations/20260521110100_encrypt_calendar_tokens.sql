-- Cifra los tokens de Google OAuth en reposo usando Supabase Vault.
--
-- Antecedente:
--   calendar_connections.access_token / refresh_token se guardaban en texto
--   plano. RLS impide que el cliente los lea (migración 005), pero cualquiera
--   con la service-role key o acceso directo a la BD veía cada token. El
--   refresh_token, en particular, da acceso prolongado al Google Calendar.
--
-- Estrategia (Vault, no pgsodium — pgsodium está deprecado en Supabase):
--   * Los tokens se guardan como secretos cifrados en Supabase Vault, con la
--     clave gestionada por Supabase (fuera de la tabla). Un volcado de la BD ya
--     no revela los tokens.
--   * Dos RPC SECURITY DEFINER (calendar_tokens_set / _get) cifran/descifran.
--     Solo las edge functions (service_role) pueden ejecutarlas; ni anon ni
--     authenticated tienen permiso.
--   * Las columnas access_token / refresh_token quedan para respaldo durante la
--     transición y se anulan en cuanto el token se mueve a Vault.

-- Nombres de secreto determinísticos por conexión: gcal_access_<id> / gcal_refresh_<id>.

create or replace function public.calendar_tokens_set(
  p_connection_id uuid,
  p_access_token text,
  p_refresh_token text
)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_access_name text := 'gcal_access_' || p_connection_id::text;
  v_refresh_name text := 'gcal_refresh_' || p_connection_id::text;
  v_id uuid;
begin
  -- ACCESS token (corto plazo): null => borrar el secreto.
  select id into v_id from vault.secrets where name = v_access_name;
  if p_access_token is null then
    if v_id is not null then delete from vault.secrets where id = v_id; end if;
  elsif v_id is null then
    perform vault.create_secret(p_access_token, v_access_name, 'Google Calendar access token');
  else
    perform vault.update_secret(v_id, p_access_token);
  end if;

  -- REFRESH token (largo plazo): null => PRESERVAR el existente (Google solo lo
  -- envía en el primer consentimiento). Nunca se borra por accidente.
  select id into v_id from vault.secrets where name = v_refresh_name;
  if p_refresh_token is not null then
    if v_id is null then
      perform vault.create_secret(p_refresh_token, v_refresh_name, 'Google Calendar refresh token');
    else
      perform vault.update_secret(v_id, p_refresh_token);
    end if;
  end if;

  -- Borra cualquier texto plano que quedara en la fila de conexión.
  update public.calendar_connections
    set access_token = null, refresh_token = null, updated_at = now()
    where id = p_connection_id;
end;
$$;

create or replace function public.calendar_tokens_get(p_connection_id uuid)
returns table (access_token text, refresh_token text)
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_access_name text := 'gcal_access_' || p_connection_id::text;
  v_refresh_name text := 'gcal_refresh_' || p_connection_id::text;
begin
  access_token := (select decrypted_secret from vault.decrypted_secrets where name = v_access_name);
  refresh_token := (select decrypted_secret from vault.decrypted_secrets where name = v_refresh_name);
  return next;
end;
$$;

-- Solo las edge functions (service_role) pueden cifrar/descifrar tokens.
revoke all on function public.calendar_tokens_set(uuid, text, text) from public, anon, authenticated;
revoke all on function public.calendar_tokens_get(uuid) from public, anon, authenticated;
grant execute on function public.calendar_tokens_set(uuid, text, text) to service_role;
grant execute on function public.calendar_tokens_get(uuid) to service_role;

-- Migración de datos (idempotente): mueve a Vault cualquier token que siga en
-- texto plano y anula la columna. En una BD nueva no hay filas: no-op.
do $$
declare r record;
begin
  for r in
    select id, access_token, refresh_token
      from public.calendar_connections
     where access_token is not null or refresh_token is not null
  loop
    perform public.calendar_tokens_set(r.id, r.access_token, r.refresh_token);
  end loop;
end $$;

comment on column public.calendar_connections.access_token is
  'DEPRECATED: respaldo de transición. Siempre NULL en producción. Los tokens viven cifrados en Supabase Vault; usa calendar_tokens_set / calendar_tokens_get.';
comment on column public.calendar_connections.refresh_token is
  'DEPRECATED: respaldo de transición. Siempre NULL en producción. Los tokens viven cifrados en Supabase Vault; usa calendar_tokens_set / calendar_tokens_get.';
