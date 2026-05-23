import { useState } from 'react';
import { clinicalApi } from '../../services/clinicalApi.js';

export function AppointmentForm({ patient, onCancel, onCreated }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title || !date) {
      setError('El titulo y la fecha son obligatorios.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await clinicalApi.addAppointment({
        patient_id: patient.id,
        title,
        appointment_date: date,
        notes
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
      <h3>Nueva Cita</h3>
      <label>
        Titulo
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </label>
      <label>
        Fecha y hora
        <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>
      <label>
        Notas
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button type="button" className="secondary" onClick={onCancel}>Cancelar</button>
        <button type="submit" disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar Cita'}
        </button>
      </div>
    </form>
  );
}
