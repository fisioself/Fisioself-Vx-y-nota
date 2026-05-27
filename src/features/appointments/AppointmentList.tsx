import { useState } from 'react';
import { calendarService } from '../../services/calendarService';
import { clinicalApi } from '../../services/clinicalApi';
import { getErrorMessage } from '../../shared/errors';
import type { Appointment, Patient } from '../../types/clinical';
import { AppointmentForm } from './AppointmentForm';
import './appointments.css';

interface AppointmentListProps {
  patient: Patient;
  appointments?: Appointment[];
  onChanged?: () => void;
}

export function AppointmentList({ patient, appointments = [], onChanged }: AppointmentListProps) {
  const [showForm, setShowForm] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const syncAppointment = async (id: string) => {
    setSyncing(id);
    try {
      await calendarService.syncAppointment(id);
      onChanged?.();
    } catch (err) {
      alert(getErrorMessage(err, 'No se pudo sincronizar la cita.'));
    } finally {
      setSyncing(null);
    }
  };

  const cancelAppointment = async (id: string) => {
    if (
      !window.confirm(
        '¿Cancelar esta cita? Si estaba sincronizada, también se eliminará el evento de tu Google Calendar.'
      )
    )
      return;
    setCancelling(id);
    try {
      await clinicalApi.updateAppointment(id, { status: 'cancelled' });
      onChanged?.();
    } catch (err) {
      alert(getErrorMessage(err, 'No se pudo cancelar la cita.'));
    } finally {
      setCancelling(null);
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
          onCreated={() => {
            setShowForm(false);
            onChanged?.();
          }}
        />
      )}

      <div className="list-stack">
        {appointments.map((appointment) => {
          const isCancelled = appointment.status === 'cancelled';
          return (
            <article
              key={appointment.id}
              className="note-row"
              style={isCancelled ? { opacity: 0.6 } : undefined}
            >
              <div className="form-header">
                <strong>{appointment.title || 'Cita sin titulo'}</strong>
                <div
                  style={{
                    display: 'flex',
                    gap: '0.5rem',
                    alignItems: 'center',
                    flexWrap: 'wrap'
                  }}
                >
                  {isCancelled ? (
                    <span className="pill" style={{ background: '#f3d9d6', color: '#7a241c' }}>
                      Cancelada
                    </span>
                  ) : (
                    <>
                      <span className="pill">
                        {appointment.sync_status === 'synced'
                          ? 'Sincronizada'
                          : appointment.sync_status === 'pending'
                            ? 'Pendiente'
                            : appointment.sync_status === 'failed'
                              ? 'Error'
                              : appointment.sync_status}
                      </span>
                      {appointment.google_html_link && (
                        <a
                          href={appointment.google_html_link}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
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
                      <button
                        className="danger"
                        disabled={cancelling === appointment.id}
                        onClick={() => cancelAppointment(appointment.id)}
                      >
                        {cancelling === appointment.id ? 'Cancelando...' : 'Cancelar cita'}
                      </button>
                    </>
                  )}
                </div>
              </div>
              <p className="muted">
                {new Date(appointment.starts_at).toLocaleString()}
                {appointment.ends_at && ` - ${new Date(appointment.ends_at).toLocaleTimeString()}`}
              </p>
              <p>{appointment.description || 'Sin notas adicionales'}</p>
            </article>
          );
        })}
        {!appointments.length && (
          <p className="muted">No hay citas programadas para este paciente.</p>
        )}
      </div>
    </section>
  );
}
