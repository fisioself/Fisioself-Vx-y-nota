export const PATIENT_STATUSES = ['En tratamiento', 'Alta', 'Seguimiento', 'Inactivo'];
export const SEX_OPTIONS = ['', 'M', 'F', 'Otro'];

export const validatePatient = (values) => {
  const errors = {};
  const name = values.full_name?.trim() || '';

  if (name.length < 2) errors.full_name = 'El nombre debe tener al menos 2 caracteres.';
  if (name.length > 180) errors.full_name = 'El nombre es demasiado largo.';

  if (values.email && !/^\S+@\S+\.\S+$/.test(values.email)) errors.email = 'Correo invalido.';
  if (values.sex && !SEX_OPTIONS.includes(values.sex)) errors.sex = 'Sexo invalido.';
  if (values.status && !PATIENT_STATUSES.includes(values.status))
    errors.status = 'Estado invalido.';

  return errors;
};

export const validateSessionNote = ({ raw_text, eva, patient_id }) => {
  const errors = {};
  const text = raw_text?.trim() || '';

  if (!patient_id) errors.patient_id = 'Selecciona un paciente antes de guardar.';
  if (text.length < 3) errors.raw_text = 'La nota debe tener contenido clinico.';
  if (text.length > 12000) errors.raw_text = 'La nota es demasiado larga.';

  if (eva != null && eva !== '') {
    const value = Number(eva);
    if (!Number.isFinite(value) || value < 0 || value > 10)
      errors.eva = 'EVA debe estar entre 0 y 10.';
  }

  return errors;
};

export const hasErrors = (errors) => Object.keys(errors).length > 0;

export const emptyStringsToNull = (values) =>
  Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, value === '' ? null : value])
  );
