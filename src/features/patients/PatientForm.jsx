import { useState } from 'react';
import { clinicalApi } from '../../services/clinicalApi.js';
import { emptyStringsToNull, hasErrors, validatePatient } from '../../shared/clinicalValidation.js';

const emptyPatient = {
  full_name: '',
  phone: '',
  status: 'En tratamiento',
};

export function PatientForm({ onCreated, onCancel }) {
  const [values, setValues] = useState(emptyPatient);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const setField = (field, value) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = async (event) => {
    event.preventDefault();
    const validation = validatePatient(values);
    setErrors(validation);
    if (hasErrors(validation)) return;

    setSaving(true);
    setSubmitError('');
    try {
      const patient = await clinicalApi.createPatient(emptyStringsToNull(values));
      setValues(emptyPatient);
      onCreated?.(patient);
    } catch (err) {
      setSubmitError(err.message || 'No se pudo crear el paciente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="card form-grid" onSubmit={submit}>
      <div className="form-header span-2">
        <div>
          <p className="eyebrow">Alta rapida</p>
          <h2>Nuevo paciente</h2>
        </div>
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>

      <label className="span-2">
        Nombre completo *
        <input
          value={values.full_name}
          onChange={(e) => setField('full_name', e.target.value)}
          onBlur={() => {
            const validation = validatePatient(values);
            if (validation.full_name) setErrors(curr => ({ ...curr, full_name: validation.full_name }));
          }}
          required
          aria-invalid={!!errors.full_name}
          aria-describedby={errors.full_name ? 'full_name-error' : undefined}
        />
        {errors.full_name && <small id="full_name-error" className="field-error" role="alert">{errors.full_name}</small>}
      </label>

      <label className="span-2">
        Telefono
        <input
          value={values.phone}
          onChange={(e) => setField('phone', e.target.value)}
          inputMode="tel"
        />
      </label>

      {submitError && (
        <p className="error span-2" role="alert">
          {submitError}
        </p>
      )}

      <div className="actions span-2">
        <button type="submit" disabled={saving}>
          {saving ? 'Creando...' : 'Crear paciente'}
        </button>
      </div>
    </form>
  );
}
