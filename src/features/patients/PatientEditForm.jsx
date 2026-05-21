import { useEffect, useState } from 'react';
import { clinicalApi } from '../../services/clinicalApi.js';
import { PATIENT_STATUSES, validatePatient, hasErrors } from '../../shared/clinicalValidation.js';

const toEditablePatient = (patient) => ({
  full_name: patient?.full_name || '',
  phone: patient?.phone || '',
  status: patient?.status || 'En valoracion'
});

export function PatientEditForm({ patient, onUpdated, onCancel }) {
  const [values, setValues] = useState(() => toEditablePatient(patient));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    setValues(toEditablePatient(patient));
    setErrors({});
    setSubmitError('');
  }, [patient?.id]);

  const setField = (field, value) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!patient?.id) return;

    const validation = validatePatient(values);
    setErrors(validation);
    if (hasErrors(validation)) return;

    setSaving(true);
    setSubmitError('');
    try {
      const payload = Object.fromEntries(
        Object.entries(values).map(([key, value]) => [key, value === '' ? null : value])
      );
      const updated = await clinicalApi.updatePatient(patient.id, payload);
      onUpdated?.(updated);
    } catch (err) {
      setSubmitError(err.message || 'No se pudo actualizar el paciente.');
    } finally {
      setSaving(false);
    }
  };

  if (!patient) return null;

  return (
    <form className="card form-grid" onSubmit={submit}>
      <div className="form-header span-2">
        <div>
          <p className="eyebrow">Editar expediente</p>
          <h2>Datos del paciente</h2>
        </div>
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>

      <label>
        Nombre completo *
        <input
          value={values.full_name}
          onChange={(e) => setField('full_name', e.target.value)}
          required
        />
        {errors.full_name && <small className="field-error">{errors.full_name}</small>}
      </label>

      <label>
        Telefono
        <input
          value={values.phone}
          onChange={(e) => setField('phone', e.target.value)}
          inputMode="tel"
        />
      </label>

      <label>
        Estado
        <select value={values.status} onChange={(e) => setField('status', e.target.value)}>
          {PATIENT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </label>

      {submitError && (
        <p className="error span-2" role="alert">
          {submitError}
        </p>
      )}

      <div className="actions span-2">
        <button type="submit" disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  );
}
