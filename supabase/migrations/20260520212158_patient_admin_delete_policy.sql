-- Allow only admins to permanently delete patients, and audit deletes.
-- Deleting a patient cascades to evaluations, notes, appointments and related rows.

create or replace function public.audit_clinical_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
  action_name text;
  entity_id uuid;
begin
  actor := auth.uid();

  if actor is null and tg_op in ('INSERT', 'UPDATE') then
    actor := (to_jsonb(new)->>'created_by')::uuid;
  end if;

  if actor is null and tg_op in ('UPDATE', 'DELETE') then
    actor := (to_jsonb(old)->>'created_by')::uuid;
  end if;

  action_name := tg_table_name || case
    when tg_op = 'INSERT' then '.created'
    when tg_op = 'UPDATE' then '.updated'
    when tg_op = 'DELETE' then '.deleted'
    else '.changed'
  end;

  entity_id := case
    when tg_op = 'DELETE' then old.id
    else new.id
  end;

  insert into public.audit_log (
    actor_id,
    action,
    entity_type,
    entity_id,
    before_json,
    after_json
  )
  values (
    actor,
    action_name,
    tg_table_name,
    entity_id,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function public.audit_clinical_change() from public;

drop trigger if exists patients_audit_clinical_change on public.patients;
create trigger patients_audit_clinical_change
after insert or update or delete on public.patients
for each row execute function public.audit_clinical_change();

drop policy if exists "patients clinic admin delete" on public.patients;
create policy "patients clinic admin delete" on public.patients
  for delete to authenticated
  using (public.is_admin() and public.can_access_clinic(clinic_id));
