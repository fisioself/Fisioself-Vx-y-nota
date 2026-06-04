-- Auditoría clínica completa: registrar también los DELETE y cubrir follow_ups.
--
-- Antes, audit_clinical_change() solo capturaba datos en INSERT/UPDATE: un DELETE
-- se registraba como acción '.changed' SIN before_json (no quedaba traza de QUÉ
-- se borró). Además evaluations no auditaba DELETE y follow_ups no se auditaba.
--
-- Esta migración (solo DDL, no toca datos):
--   1. Reescribe audit_clinical_change() PRESERVANDO la redacción de PHI de
--      20260527000000 y añadiendo:
--        • acción '.deleted' y captura de before_json en DELETE;
--        • redacción de campos sensibles de evaluations (red_flags, prognosis,
--          sections, medical_diagnosis) para no exponer PHI en el audit_log.
--   2. Re-crea TODOS los triggers clínicos con INSERT/UPDATE/DELETE para una
--      cobertura uniforme, e incluye follow_ups (antes sin auditoría).

create or replace function public.audit_clinical_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
  action_name text;
  before_redacted jsonb;
  after_redacted jsonb;
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

  -- before_json: para UPDATE y DELETE (estado previo / borrado), con PHI redactada.
  if tg_op in ('UPDATE', 'DELETE') then
    before_redacted := to_jsonb(old);
    if tg_table_name = 'session_notes' then
      before_redacted := before_redacted - 'raw_text';
    elsif tg_table_name = 'patients' then
      before_redacted := before_redacted - 'medical_diagnosis' - 'functional_diagnosis';
    elsif tg_table_name = 'evaluations' then
      before_redacted := before_redacted - 'red_flags' - 'prognosis' - 'sections' - 'medical_diagnosis';
    end if;
  end if;

  -- after_json: para INSERT y UPDATE (estado nuevo), con PHI redactada.
  if tg_op in ('INSERT', 'UPDATE') then
    after_redacted := to_jsonb(new);
    if tg_table_name = 'session_notes' then
      after_redacted := after_redacted - 'raw_text';
    elsif tg_table_name = 'patients' then
      after_redacted := after_redacted - 'medical_diagnosis' - 'functional_diagnosis';
    elsif tg_table_name = 'evaluations' then
      after_redacted := after_redacted - 'red_flags' - 'prognosis' - 'sections' - 'medical_diagnosis';
    end if;
  end if;

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
    before_redacted,
    after_redacted
  );

  -- AFTER trigger: el valor de retorno se ignora, pero devolvemos una fila válida.
  return coalesce(new, old);
end;
$$;

revoke all on function public.audit_clinical_change() from public;

-- Re-crear todos los triggers clínicos con cobertura INSERT/UPDATE/DELETE.
drop trigger if exists patients_audit_clinical_change on public.patients;
create trigger patients_audit_clinical_change
after insert or update or delete on public.patients
for each row execute function public.audit_clinical_change();

drop trigger if exists evaluations_audit_clinical_change on public.evaluations;
create trigger evaluations_audit_clinical_change
after insert or update or delete on public.evaluations
for each row execute function public.audit_clinical_change();

drop trigger if exists session_notes_audit_clinical_change on public.session_notes;
create trigger session_notes_audit_clinical_change
after insert or update or delete on public.session_notes
for each row execute function public.audit_clinical_change();

drop trigger if exists appointments_audit_clinical_change on public.appointments;
create trigger appointments_audit_clinical_change
after insert or update or delete on public.appointments
for each row execute function public.audit_clinical_change();

drop trigger if exists ai_consults_audit_clinical_change on public.ai_consults;
create trigger ai_consults_audit_clinical_change
after insert or update or delete on public.ai_consults
for each row execute function public.audit_clinical_change();

drop trigger if exists follow_ups_audit_clinical_change on public.follow_ups;
create trigger follow_ups_audit_clinical_change
after insert or update or delete on public.follow_ups
for each row execute function public.audit_clinical_change();
