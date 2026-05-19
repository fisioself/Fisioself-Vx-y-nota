import { useState } from 'react';
import { useToast } from '../../app/ToastProvider.jsx';
import { calendarService, isGoogleCalendarConfigured } from '../../services/calendarService.js';

const formatDateTime = (value) => {
  if (!value) return 'Sin fecha';
  return new Date(value).toLocaleString('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
};

const statusLabel = {
  scheduled: 'Programada',
  completed: 'Completada',
  cancelled: 'Cancelada',
  no_show: 'No asistio'
};

const syncLabel = {
  pending: 'Pendiente Google',
  synced: 'Sincronizada',
  failed: 'Error Google',
  disabled: 'Sin Google'
};

export function AppointmentsList({ appointments = [], onSynced }) {
  const [busyId, setBusyId] = useState(null);
  const { notify } = useToast();
  const sorted = [...appointments].sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at));

  const connectGoogle = async () => {
    try {
      await calendarService.startGoogleConnection();
      notify({ tone: 'success', message: 'Abriendo autorizacion de Google Calendar.' });
    } catch (err) {
      notify({ tone: 'error', message: err.message || 'No se pudo conectar Google Calendar.' });
    }
  };

  const syncAppointment = async (appointment) => {
    setBusyId(appointment.id);
    try {
      const updated = await calendarService.syncAppointment(appointment.id);
      notify({ tone: 'success', message: 'Cita sincronizada con Google Calendar.' });
      onSynced?.(updated);
    } catch (err) {
      notify({ tone: 'error', message: err.message || 'No se pudo sincronizar cita.' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="card">
      <div className="form-header">
        <div>
          <p className="eyebrow">Agenda</p>
          <h2>Citas del paciente</h2>
        </div>
        <div className="hero-actions">
          <span className="pill">{sorted.length}</span>
          <button
            type="button"
            className="secondary"
            onClick={connectGoogle}
            disabled={!isGoogleCalendarConfigured}
          >
            Conectar Google
          </button>
        </div>
      </div>

      {!isGoogleCalendarConfigured && (
        <p className="muted">
          Configura las URLs de funciones Google Calendar para activar sincronizacion.
        </p>
      )}

      <div className="list-stack">
        {sorted.map((appointment) => (
          <article key={appointment.id} className="note-row">
            <div className="form-header">
              <div>
                <strong>{appointment.title}</strong>
                <p className="muted">
                  {formatDateTime(appointment.starts_at)} - {formatDateTime(appointment.ends_at)}
                </p>
              </div>
              <span className="timeline-type">
                {statusLabel[appointment.status] || appointment.status}
              </span>
            </div>
            {appointment.location && <p>{appointment.location}</p>}
            {appointment.description && <p className="muted">{appointment.description}</p>}
            <p className="muted">
              Google Calendar: {syncLabel[appointment.sync_status] || appointment.sync_status}
            </p>
            <div className="actions">
              {appointment.google_html_link && (
                <a href={appointment.google_html_link} target="_blank" rel="noreferrer">
                  Abrir en Google Calendar
                </a>
              )}
              {appointment.sync_status !== 'disabled' && appointment.sync_status !== 'synced' && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => syncAppointment(appointment)}
                  disabled={!isGoogleCalendarConfigured || busyId === appointment.id}
                >
                  {busyId === appointment.id ? 'Sincronizando...' : 'Sincronizar Google'}
                </button>
              )}
            </div>
            {appointment.sync_error && <p className="error">{appointment.sync_error}</p>}
          </article>
        ))}
        {!sorted.length && (
          <p className="muted">Aun no hay citas registradas para este paciente.</p>
        )}
      </div>
    </section>
  );
}
