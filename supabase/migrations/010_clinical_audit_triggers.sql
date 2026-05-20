-- Move critical clinical audit logging out of the browser.
-- Run after 009_ai_rate_limit_persistence.sql.

create or replace function public.audit_clinical_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
  action_name text;
begin
  actor := auth.uid();

  if actor is null and tg_op in ('INSERT', 'UPDATE') then
    actor := (to_jsonb(new)->>'created_by')::uuid;
  end if;

  if actor is null and tg_op = 'UPDATE' then
    actor := (to_jsonb(old)->>'created_by')::uuid;
  end if;

  action_name := tg_table_name || case
    when tg_op = 'INSERT' then '.created'
    when tg_op = 'UPDATE' then '.updated'
    else '.changed'
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
    coalesce(new.id, old.id),
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  return new;
end;
$$;

revoke all on function public.audit_clinical_change() from public;

drop trigger if exists patients_audit_clinical_change on public.patients;
create trigger patients_audit_clinical_change
after insert or update on public.patients
for each row execute function public.audit_clinical_change();

drop trigger if exists evaluations_audit_clinical_change on public.evaluations;
create trigger evaluations_audit_clinical_change
after insert or update on public.evaluations
for each row execute function public.audit_clinical_change();

drop trigger if exists session_notes_audit_clinical_change on public.session_notes;
create trigger session_notes_audit_clinical_change
after insert or update on public.session_notes
for each row execute function public.audit_clinical_change();

drop trigger if exists appointments_audit_clinical_change on public.appointments;
create trigger appointments_audit_clinical_change
after insert or update on public.appointments
for each row execute function public.audit_clinical_change();

drop trigger if exists ai_consults_audit_clinical_change on public.ai_consults;
create trigger ai_consults_audit_clinical_change
after insert or update on public.ai_consults
for each row execute function public.audit_clinical_change();
