-- Meta funcional del paciente ("cargar a su nieto sin dolor lumbar"): objetivo
-- de vida que enmarca el tratamiento. Se muestra en el hero del expediente.
-- Cubierta por las políticas RLS existentes de patients (lectura/escritura por
-- clínica); no requiere policies nuevas.
alter table public.patients
  add column if not exists functional_goal text;
