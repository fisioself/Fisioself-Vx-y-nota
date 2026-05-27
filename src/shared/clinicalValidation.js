export const PATIENT_STATUSES = [
  'En tratamiento',
  'Alta',
  'Seguimiento',
  'Inactivo'
];
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

  // Hallazgo #13: Birth date validation
  if (values.birth_date && new Date(values.birth_date) > new Date()) {
    errors.birth_date = 'La fecha de nacimiento no puede ser futura.';
  }

  // Hallazgo #13: Phone length
  if (values.phone && (values.phone.trim().length < 7 || values.phone.trim().length > 20)) {
    errors.phone = 'El telefono debe tener entre 7 y 20 caracteres.';
  }

  return errors;
};

export const validateSessionNote = ({ raw_text, eva, patient_id, session_date }) => {
  const errors = {};
  const text = raw_text?.trim() || '';

  if (!patient_id) errors.patient_id = 'Selecciona un paciente antes de guardar.';
  
  // Hallazgo #13: Session date validation
  if (!session_date) {
    errors.session_date = 'La fecha de la sesion es obligatoria.';
  } else if (new Date(session_date) > new Date()) {
    errors.session_date = 'La fecha de la sesion no puede ser futura.';
  }

  if (text.length < 3) errors.raw_text = 'La nota debe tener contenido clinico.';
  if (text.length > 12000) errors.raw_text = 'La nota es demasiado larga.';

  if (eva !== '' && eva !== null && eva !== undefined) {
    const value = Number(eva);
    if (!Number.isFinite(value) || value < 0 || value > 10)
      errors.eva = 'EVA debe estar entre 0 y 10.';
  }

  return errors;
};

export const hasErrors = (errors) => Object.keys(errors).length > 0;
