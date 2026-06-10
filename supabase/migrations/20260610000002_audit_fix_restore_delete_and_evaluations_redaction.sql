-- CORRECCIÓN: la migración 20260610000001 (filtro de ruido del sync) se basó por
-- error en la versión de audit_clinical_change de 20260527000000 y pisó la versión
-- más nueva de 20260604000000, perdiendo:
--   • el manejo de DELETE (acción '.deleted' + before_json del borrado), y
--   • la redacción de PHI de evaluations (red_flags, prognosis, sections,
--     medical_diagnosis).
-- Aquí se re-aplica la función COMPLETA (cobertura INSERT/UPDATE/DELETE + toda la
-- redacción de PHI) y se conserva el filtro de ruido del sync de appointments.

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

  -- Filtro de ruido del sync: UPDATE de appointments donde solo cambiaron
  -- columnas volátiles (sin valor clínico) no se audita.
  if tg_op = 'UPDATE' and tg_table_name = 'appointments' then
    if (to_jsonb(old) - 'updated_at' - 'sync_status' - 'last_synced_at' - 'google_html_link')
       = (to_jsonb(new) - 'updated_at' - 'sync_status' - 'last_synced_at' - 'google_html_link') then
      return coalesce(new, old);
    end if;
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

  return coalesce(new, old);
end;
$$;

revoke all on function public.audit_clinical_change() from public;
