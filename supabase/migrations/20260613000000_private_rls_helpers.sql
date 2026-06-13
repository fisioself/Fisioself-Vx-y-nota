-- ================================================================
-- Endurecimiento: mover los helpers internos de RLS al esquema `private`.
--
-- Motivo: PostgREST expone como endpoint /rest/v1/rpc/* toda función del
-- esquema `public`. Estas 7 funciones son SECURITY DEFINER y solo deben
-- usarse DENTRO de las políticas RLS y de los DEFAULT de columnas, nunca
-- llamarse directamente por un cliente. Al moverlas a `private` dejan de
-- estar expuestas (PostgREST no publica ese esquema) sin perder funcionalidad.
--
-- Por qué NO se usa REVOKE EXECUTE (que sugiere el linter por defecto):
--   * `default_clinic_id()` es DEFAULT de la columna clinic_id en 7 tablas;
--     revocar EXECUTE haría fallar todos los INSERT.
--   * El resto se invoca dentro de políticas RLS; revocar EXECUTE haría
--     fallar los SELECT/UPDATE de los usuarios autenticados.
--
-- ALTER FUNCTION ... SET SCHEMA preserva el OID, así que las políticas RLS,
-- los DEFAULT, vistas y constraints siguen apuntando a la función sin cambios.
-- Solo hay que reescribir los CUERPOS que invocan a estos helpers por nombre
-- (los cuerpos SQL/plpgsql se resuelven por texto, no por OID).
-- ================================================================

create schema if not exists private;

-- Los helpers se evalúan como el usuario que corre la consulta (al invocarlos
-- dentro de RLS / de un DEFAULT), por lo que esos roles necesitan USAGE sobre
-- el esquema. El privilegio EXECUTE ya viene preservado por ALTER ... SET SCHEMA.
grant usage on schema private to authenticated, service_role;

-- 1) Mover las 7 funciones internas (OID intacto => RLS y DEFAULTs no cambian)
alter function public.is_active_clinical_user() set schema private;
alter function public.current_profile_role() set schema private;
alter function public.default_clinic_id() set schema private;
alter function public.is_admin() set schema private;
alter function public.is_admin_or_therapist() set schema private;
alter function public.can_access_clinic(uuid) set schema private;
alter function public.can_write_clinic(uuid) set schema private;

-- 2) Reescribir los cuerpos que llamaban a otros helpers por `public.*`
--    (current_profile_role, default_clinic_id e is_active_clinical_user no
--     llaman a otros helpers: solo consultan tablas public.* ya cualificadas,
--     por lo que no necesitan reescritura).

create or replace function private.is_admin()
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public'
as $$
  select private.current_profile_role() = 'admin'
$$;

create or replace function private.is_admin_or_therapist()
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public'
as $$
  select private.current_profile_role() in ('admin', 'therapist')
$$;

create or replace function private.can_access_clinic(target_clinic_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public'
as $$
  select private.is_active_clinical_user()
    and exists (
      select 1
      from public.clinic_memberships
      where clinic_id = target_clinic_id
        and user_id = auth.uid()
        and active = true
    )
$$;

create or replace function private.can_write_clinic(target_clinic_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public'
as $$
  select private.is_admin_or_therapist()
    and exists (
      select 1
      from public.clinic_memberships
      where clinic_id = target_clinic_id
        and user_id = auth.uid()
        and active = true
        and role in ('admin', 'therapist')
    )
$$;

-- 3) Funciones que se quedan en public (la app las llama, o son triggers) pero
--    que invocaban a los helpers movidos: cualificarlas con `private.*`.

create or replace function public.list_deleted_patients()
  returns setof patients
  language sql
  security definer
  set search_path to 'public'
as $$
  select *
  from public.patients
  where deleted_at is not null
    and private.is_admin()
    and private.can_access_clinic(clinic_id)
  order by deleted_at desc;
$$;

create or replace function public.restore_patient(p_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path to 'public'
as $$
begin
  if not private.is_admin() then
    raise exception 'Solo un administrador puede restaurar pacientes';
  end if;
  update public.patients
     set deleted_at = null
   where id = p_id
     and private.can_access_clinic(clinic_id);
end;
$$;

create or replace function public.sync_default_clinic_membership()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  target_clinic_id uuid;
begin
  target_clinic_id := private.default_clinic_id();

  if target_clinic_id is null then
    return new;
  end if;

  insert into public.clinic_memberships (clinic_id, user_id, role, active)
  values (target_clinic_id, new.id, new.role, new.active)
  on conflict (clinic_id, user_id) do update
  set role = excluded.role,
      active = excluded.active,
      updated_at = now();

  return new;
end;
$$;
