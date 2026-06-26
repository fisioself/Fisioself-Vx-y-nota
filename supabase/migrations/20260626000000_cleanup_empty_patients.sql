-- Auto-limpieza de expedientes vacíos.
--
-- Problema: al importar la agenda de Google se crea un paciente por cada cita.
-- Si el paciente "agenda pero no viene" y se borra la cita del calendario (o se
-- borra cualquier cita manual), el expediente quedaba guardado VACÍO, sin ningún
-- dato clínico. Lo mismo pasa con pacientes de prueba.
--
-- Solución: un trigger AFTER DELETE en `appointments` que, si el paciente quedó
-- sin NINGUNA cita ni dato clínico (valoración, nota de sesión, pago o documento),
-- elimina el expediente. Es SECURITY DEFINER para que el borrado en cascada
-- proceda sin chocar con RLS, independientemente de quién borre la cita
-- (cron de sincronización con service_role o un admin desde la app).

create or replace function public.cleanup_empty_patient()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Si el paciente ya no existe (p. ej. la cita se borró en cascada al eliminar
  -- al propio paciente), no hay nada que hacer y evitamos recursión.
  if not exists (select 1 from patients where id = old.patient_id) then
    return old;
  end if;

  -- Solo se elimina si el expediente quedó completamente vacío.
  if not exists (select 1 from appointments where patient_id = old.patient_id)
     and not exists (select 1 from evaluations where patient_id = old.patient_id)
     and not exists (select 1 from session_notes where patient_id = old.patient_id)
     and not exists (select 1 from payments where patient_id = old.patient_id)
     and not exists (select 1 from patient_documents where patient_id = old.patient_id)
  then
    delete from patients where id = old.patient_id;
  end if;

  return old;
end;
$$;

revoke all on function public.cleanup_empty_patient() from public;

drop trigger if exists appointments_cleanup_empty_patient on public.appointments;
create trigger appointments_cleanup_empty_patient
  after delete on public.appointments
  for each row execute function public.cleanup_empty_patient();
