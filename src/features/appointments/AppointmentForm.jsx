import { useState } from 'react';
import { clinicalApi } from '../../services/clinicalApi.js';

const DEFAULT_DURATION_MIN = 45;

export function AppointmentForm({ patient, onCancel, onCreated }) {
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [durationMin, setDurationMin] = useState(DEFAULT_DURATION_MIN);
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !startsAt) {
      setError('El titulo y la fecha/hora de inicio son obligatorios.');
      return;
    }
    const start = new Date(startsAt);
    if (Number.isNaN(start.getTime())) {
      setError('La fecha de inicio no es valida.');
      return;
    }
    const minutes = Number(durationMin) > 0 ? Number(durationMin) : DEFAULT_DURATION_MIN;
    const end = new Date(start.getTime() + minutes * 60 * 1000);
    setSaving(true);
    setError('');
    try {
      await clinicalApi.addAppointment({
        patient_id: patient.id,
        title: title.trim(),
        description: description.trim() || null,
        location: location.trim() || null,
        starts_at: start.toISOString(),
        ends_at: end.toISOString()
      });
      onCreated?.();
    } catch (err) {
      setError(err.message || 'No se pudo crear la cita.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h3>Nueva cita</h3>
      <label>
        Titulo
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </label>
      <label>
        Fecha y hora de inicio
        <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
      </label>
      <label>
        Duracion (minutos)
        <input type="number" min="5" step="5" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} />
      </label>
      <label>
        Lugar
        <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} />
      </label>
      <label>
        Descripcion
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="button" className="secondary" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar cita'}
        </button>
      </div>
    </form>
  );
}
