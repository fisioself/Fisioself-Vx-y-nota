import { useState } from 'react';
import { clinicalApi } from '../../services/clinicalApi';

interface AppointmentFormProps {
  patient: Patient;
  onCancel?: () => void;
  onCreated?: () => void;
}

export function AppointmentForm({ patient, onCancel, onCreated }: AppointmentFormProps) {
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleStartsAtChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newStartsAt = e.target.value;
    setStartsAt(newStartsAt);

    if (newStartsAt && !endsAt) {
      const date = new Date(newStartsAt);
      date.setHours(date.getHours() + 1);
      setEndsAt(date.toISOString().slice(0, 16));
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!title || !startsAt || !endsAt) {
      setError('El titulo y las fechas son obligatorios.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await clinicalApi.addAppointment({
        patient_id: patient.id,
        title,
        starts_at: new Date(startsAt).toISOString(),
        ends_at: new Date(endsAt).toISOString(),
        description
      });
      onCreated?.();
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo crear la cita.'));
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
      <div style={{ display: 'flex', gap: '1rem' }}>
        <label style={{ flex: 1 }}>
          Inicio
          <input type="datetime-local" value={startsAt} onChange={handleStartsAtChange} required />
        </label>
        <label style={{ flex: 1 }}>
          Fin
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            required
          />
        </label>
      </div>
      <label>
        Notas (Descripción)
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button type="button" className="secondary" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar Cita'}
        </button>
      </div>
    </form>
  );
}
