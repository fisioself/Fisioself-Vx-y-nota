-- No auditar el ruido del sync de Google Calendar.
--
-- El sync (google-calendar-fetch) reescribía TODAS las citas en cada ciclo con
-- updated_at = now(), aunque nada hubiera cambiado. Cada UPDATE disparaba este
-- trigger → audit_log creció a 207k filas / 407 MB en 3 semanas (86% del plan
-- Free). Aquí: en UPDATE de appointments, si lo único que cambió son columnas
-- volátiles (marca de tiempo, estado de sync, enlace de Google), NO se audita.
-- Se preserva la redacción de PHI de la migración 20260527000000.

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

  if actor is null and tg_op = 'UPDATE' then
    actor := (to_jsonb(old)->>'created_by')::uuid;
  end if;

  -- Filtro de ruido: UPDATE de appointments donde solo cambiaron columnas
  -- volátiles (sin valor clínico) no se audita.
  if tg_op = 'UPDATE' and tg_table_name = 'appointments' then
    if (to_jsonb(old) - 'updated_at' - 'sync_status' - 'last_synced_at' - 'google_html_link')
       = (to_jsonb(new) - 'updated_at' - 'sync_status' - 'last_synced_at' - 'google_html_link') then
      return new;
    end if;
  end if;

  action_name := tg_table_name || case
    when tg_op = 'INSERT' then '.created'
    when tg_op = 'UPDATE' then '.updated'
    else '.changed'
  end;

  -- Redaction logic (idéntica a 20260527000000_redact_audit_phi.sql)
  if tg_op = 'UPDATE' then
    before_redacted := to_jsonb(old);
    if tg_table_name = 'session_notes' then
      before_redacted := before_redacted - 'raw_text';
    elsif tg_table_name = 'patients' then
      before_redacted := before_redacted - 'medical_diagnosis' - 'functional_diagnosis';
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    after_redacted := to_jsonb(new);
    if tg_table_name = 'session_notes' then
      after_redacted := after_redacted - 'raw_text';
    elsif tg_table_name = 'patients' then
      after_redacted := after_redacted - 'medical_diagnosis' - 'functional_diagnosis';
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

  return new;
end;
$$;
