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
              <strong>{appointment.title || 'Cita sin titulo'}</strong>
              <div>
                <button 
                  className="secondary" 
                  disabled={syncing === appointment.id}
                  onClick={() => syncAppointment(appointment.id)}
                >
                  {syncing === appointment.id ? 'Sincronizando...' : 'Sincronizar'}
                </button>
              </div>
            </div>
            <p className="muted">{new Date(appointment.appointment_date).toLocaleString()}</p>
            <p>{appointment.notes || 'Sin notas adicionales'}</p>
          </article>
        ))}
        {!appointments.length && (
          <p className="muted">No hay citas programadas para este paciente.</p>
        )}
      </div>
    </section>
  );
}
