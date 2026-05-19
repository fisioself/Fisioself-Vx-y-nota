import { useState } from 'react';
import { clinicalApi } from '../../services/clinicalApi.js';

const toLocalInputValue = (date) => {
  const value = date ? new Date(date) : new Date();
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 16);
};

export function AppointmentForm({ patient, therapistId, onCreated, onCancel }) {
  const now = new Date();
  const end = new Date(now.getTime() + 45 * 60 * 1000);
  const [values, setValues] = useState({
    title: patient?.full_name ? `Sesion FISIOSELF - ${patient.full_name}` : 'Sesion FISIOSELF',
    starts_at: toLocalInputValue(now),
    ends_at: toLocalInputValue(end),
    location: '',
    description: '',
    sync_to_google: true
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const setField = (field, value) => {
    setValues((current) => ({ ...current, [field]: value }));
    setError('');
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!patient?.id) {
      setError('Selecciona un paciente antes de crear una cita.');
      return;
    }

    const startsAt = new Date(values.starts_at);
    const endsAt = new Date(values.ends_at);
    if (
      !Number.isFinite(startsAt.getTime()) ||
      !Number.isFinite(endsAt.getTime()) ||
      endsAt <= startsAt
    ) {
      setError('La hora de fin debe ser posterior al inicio.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const appointment = await clinicalApi.addAppointment({
        patient_id: patient.id,
        therapist_id: therapistId || null,
        title: values.title.trim(),
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        location: values.location.trim() || null,
        description: values.description.trim() || null,
        sync_status: values.sync_to_google ? 'pending' : 'disabled'
      });
      onCreated?.(appointment);
    } catch (err) {
      setError(err.message || 'No se pudo crear la cita.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="card form-grid" onSubmit={submit}>
      <div className="form-header span-2">
        <div>
          <p className="eyebrow">Agenda clinica</p>
          <h2>Nueva cita</h2>
        </div>
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>

      <label className="span-2">
        Titulo
        <input value={values.title} onChange={(e) => setField('title', e.target.value)} required />
      </label>

      <label>
        Inicio
        <input
          type="datetime-local"
          value={values.starts_at}
          onChange={(e) => setField('starts_at', e.target.value)}
          required
        />
      </label>

      <label>
        Fin
        <input
          type="datetime-local"
          value={values.ends_at}
          onChange={(e) => setField('ends_at', e.target.value)}
          required
        />
      </label>

      <label className="span-2">
        Ubicacion
        <input
          value={values.location}
          onChange={(e) => setField('location', e.target.value)}
          placeholder="Clinica, consultorio, videollamada..."
        />
      </label>

      <label className="span-2">
        Informacion para la cita
        <textarea
          rows="3"
          value={values.description}
          onChange={(e) => setField('description', e.target.value)}
          placeholder="Objetivo, preparacion, indicaciones para el paciente..."
        />
      </label>

      <label className="checkbox-label span-2">
        <input
          type="checkbox"
          checked={values.sync_to_google}
          onChange={(e) => setField('sync_to_google', e.target.checked)}
        />
        Sincronizar con Google Calendar cuando la conexion este configurada.
      </label>

      {error && (
        <p className="error span-2" role="alert">
          {error}
        </p>
      )}

      <div className="actions span-2">
        <button type="submit" disabled={saving}>
          {saving ? 'Creando...' : 'Crear cita'}
        </button>
      </div>
    </form>
  );
}
