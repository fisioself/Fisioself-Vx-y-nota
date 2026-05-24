import { useMemo, useState } from 'react';
import { calendarService, isGoogleCalendarConfigured } from '../../services/calendarService.js';
import { AppointmentForm } from './AppointmentForm.jsx';
import { CalendarConfig } from './CalendarConfig.jsx';
import './appointments.css';

const SYNC_LABELS = {
  pending: 'Pendiente de sincronizar',
  synced: 'Sincronizada con Google',
  failed: 'Error al sincronizar',
  disabled: 'Sincronizacion desactivada'
};

const formatDate = (value) => {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Fecha invalida' : date.toLocaleString();
};

export function AppointmentList({ patient, appointments = [], onChanged }) {
  const [showForm, setShowForm] = useState(false);
  const [syncing, setSyncing] = useState(null);
  const [error, setError] = useState('');

  const syncAppointment = async (id) => {
    setSyncing(id);
    setError('');
    try {
      await calendarService.syncAppointment(id);
      onChanged?.();
    } catch (err) {
      setError(err.message || 'No se pudo sincronizar la cita.');
    } finally {
      setSyncing(null);
    }
  };

  const sorted = useMemo(
    () => [...appointments].sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at)),
    [appointments]
  );

  return (
    <section className="card">
      <div className="form-header">
        <div>
          <p className="eyebrow">Agenda</p>
          <h2>Citas programadas</h2>
        </div>
        <button type="button" className="secondary" onClick={() => setShowForm((value) => !value)}>
          {showForm ? 'Cancelar' : 'Nueva cita'}
        </button>
      </div>

      {isGoogleCalendarConfigured && <CalendarConfig />}

      {showForm && (
        <AppointmentForm
          patient={patient}
          onCancel={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false);
            onChanged?.();
          }}
        />
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="appointments-stack">
        {sorted.map((appointment) => (
          <article key={appointment.id} className="note-row">
            <div className="form-header">
              <strong>{appointment.title || 'Cita sin titulo'}</strong>
              <button
                type="button"
                className="secondary"
                disabled={syncing === appointment.id || !isGoogleCalendarConfigured}
                onClick={() => syncAppointment(appointment.id)}
              >
                {syncing === appointment.id ? 'Sincronizando...' : 'Sincronizar'}
              </button>
            </div>
            <p className="muted">{formatDate(appointment.starts_at)}</p>
            {appointment.location && <p className="muted">Lugar: {appointment.location}</p>}
            <p>{appointment.description || 'Sin descripcion adicional'}</p>
            <p className="pill">
              {SYNC_LABELS[appointment.sync_status] || appointment.sync_status}
            </p>
            {appointment.google_html_link && (
              <p>
                <a href={appointment.google_html_link} target="_blank" rel="noopener noreferrer">
                  Ver en Google Calendar
                </a>
              </p>
            )}
          </article>
        ))}
        {!sorted.length && <p className="muted">No hay citas programadas para este paciente.</p>}
      </div>
    </section>
  );
}
