import type { Patient, SessionNote, ValidationErrors } from '../types/clinical';

export const PATIENT_STATUSES = ['En tratamiento', 'Alta', 'Seguimiento', 'Inactivo'] as const;
export const SEX_OPTIONS = ['', 'M', 'F', 'Otro'] as const;

type PatientInput = {
  full_name?: string | null;
  email?: string | null;
  sex?: string | null;
  status?: string | null;
  phone?: string | null;
  birth_date?: string | null;
  [key: string]: unknown;
};
type SessionNoteInput = {
  raw_text?: string | null;
  eva?: number | string | null;
  patient_id?: string | null;
  session_date?: string | null;
};

const isFutureDate = (value: string): boolean => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date.getTime() > today.getTime();
};

export const validatePatient = (values: PatientInput): ValidationErrors<Patient> => {
  const errors: ValidationErrors<Patient> = {};
  const name = (typeof values.full_name === 'string' ? values.full_name : '').trim();

  if (name.length < 2) errors.full_name = 'El nombre debe tener al menos 2 caracteres.';
  if (name.length > 180) errors.full_name = 'El nombre es demasiado largo.';

  if (typeof values.email === 'string' && values.email && !/^\S+@\S+\.\S+$/.test(values.email))
    errors.email = 'Correo invalido.';

  if (typeof values.phone === 'string' && values.phone) {
    const digits = values.phone.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 20)
      errors.phone = 'El telefono debe tener entre 7 y 20 digitos.';
  }

  if (typeof values.birth_date === 'string' && values.birth_date && isFutureDate(values.birth_date))
    errors.birth_date = 'La fecha de nacimiento no puede ser futura.';
  if (values.sex && !SEX_OPTIONS.includes(values.sex as (typeof SEX_OPTIONS)[number]))
    errors.sex = 'Sexo invalido.';
  if (
    values.status &&
    !PATIENT_STATUSES.includes(values.status as (typeof PATIENT_STATUSES)[number])
  )
    errors.status = 'Estado invalido.';

  return errors;
};

export const validateSessionNote = ({
  raw_text,
  eva,
  patient_id,
  session_date
}: SessionNoteInput): ValidationErrors<SessionNote> => {
  const errors: ValidationErrors<SessionNote> = {};
  const text = (raw_text ?? '').trim();

  if (!patient_id) errors.patient_id = 'Selecciona un paciente antes de guardar.';

  const date = (session_date ?? '').trim();
  if (!date) errors.session_date = 'La fecha de la sesion es obligatoria.';
  else if (isFutureDate(date)) errors.session_date = 'La fecha de la sesion no puede ser futura.';

  if (text.length < 3) errors.raw_text = 'La nota debe tener contenido clinico.';
  if (text.length > 12000) errors.raw_text = 'La nota es demasiado larga.';

  if (eva != null && eva !== '') {
    const value = Number(eva);
    if (!Number.isFinite(value) || value < 0 || value > 10)
      errors.eva = 'EVA debe estar entre 0 y 10.';
  }

  return errors;
};

export const hasErrors = (errors: Record<string, unknown>): boolean =>
  Object.keys(errors).length > 0;

export const emptyStringsToNull = <T extends object>(values: T): { [K in keyof T]: T[K] | null } =>
  Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, value === '' ? null : value])
  ) as { [K in keyof T]: T[K] | null };
