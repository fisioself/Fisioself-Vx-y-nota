import { useState, type FormEvent } from 'react';
import { clinicalApi } from '../../services/clinicalApi';
import { emptyStringsToNull, hasErrors, validatePatient } from '../../shared/clinicalValidation';
import type { Patient, PatientStatus, ValidationErrors } from '../../types/clinical';

interface PatientFormProps {
  onCreated?: (patient: Patient) => void;
  onCancel?: () => void;
}

interface PatientFormValues {
  full_name: string;
  phone: string;
  medical_diagnosis: string;
  status: PatientStatus;
  [key: string]: unknown;
}

const emptyPatient: PatientFormValues = {
  full_name: '',
  phone: '',
  medical_diagnosis: '',
  status: 'En tratamiento'
};

export function PatientForm({ onCreated, onCancel }: PatientFormProps) {
  const [values, setValues] = useState<PatientFormValues>(emptyPatient);
  const [errors, setErrors] = useState<ValidationErrors<Patient>>({});
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const setField = <K extends keyof PatientFormValues>(field: K, value: PatientFormValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
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
      setSubmitError(err instanceof Error ? err.message : 'No se pudo crear el paciente.');
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
            if (validation.full_name)
              setErrors((current) => ({ ...current, full_name: validation.full_name }));
          }}
          required
          aria-invalid={!!errors.full_name}
          aria-describedby={errors.full_name ? 'full_name-error' : undefined}
        />
        {errors.full_name && (
          <small id="full_name-error" className="field-error" role="alert">
            {errors.full_name}
          </small>
        )}
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
        Zona a tratar
        <input
          type="text"
          value={values.medical_diagnosis}
          onChange={(e) => setField('medical_diagnosis', e.target.value)}
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
