import { useState } from 'react';
import { calendarService } from '../../services/calendarService.js';
import { AppointmentForm } from './AppointmentForm.jsx';
import './appointments.css';

export function AppointmentList({ patient, appointments = [], onChanged }) {
  const [showForm, setShowForm] = useState(false);
  const [syncing, setSyncing] = useState(null);

  const syncAppointment = async (id) => {
    setSyncing(id);
    try {
      await calendarService.syncAppointment(id);
      onChanged?.();
    } catch (err) {
      alert(err.message);
    } finally {
      setSyncing(null);
    }
  };

  return (
    <section className="card">
      <div className="form-header">
        <div>
          <p className="eyebrow">Agenda</p>
          <h2>Citas programadas</h2>
        </div>
        <button type="button" className="secondary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancelar' : 'Nueva cita'}
        </button>
      </div>

      {showForm && (
        <AppointmentForm 
          patient={patient} 
          onCancel={() => setShowForm(false)} 
          onCreated={() => { setShowForm(false); onChanged?.(); }}
        />
      )}

      <div className="list-stack">
        {appointments.map((appointment) => (
          <article key={appointment.id} className="note-row">
            <div className="form-header">
              <strong>
                {appointment.title || 'Cita sin titulo'}
              </strong>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span className="pill">
                  {appointment.sync_status === 'synced' ? 'Sincronizada' : 
                   appointment.sync_status === 'pending' ? 'Pendiente' : 
                   appointment.sync_status === 'failed' ? 'Error' : appointment.sync_status}
                </span>
                {appointment.google_html_link && (
                  <a href={appointment.google_html_link} target="_blank" rel="noopener noreferrer">
                    Ver en Calendar
                  </a>
                )}
                {appointment.sync_status !== 'synced' && (
                  <button
                    className="secondary"
                    disabled={syncing === appointment.id}
                    onClick={() => syncAppointment(appointment.id)}
                  >
                    {syncing === appointment.id ? 'Sincronizando...' : 'Sincronizar'}
                  </button>
                )}
              </div>
            </div>            <p className="muted">
              {new Date(appointment.starts_at).toLocaleString()} 
              {appointment.ends_at && ` - ${new Date(appointment.ends_at).toLocaleTimeString()}`}
            </p>
            <p>{appointment.description || 'Sin notas adicionales'}</p>
          </article>
        ))}
        {!appointments.length && (
          <p className="muted">No hay citas programadas para este paciente.</p>
        )}
      </div>
    </section>
  );
}
