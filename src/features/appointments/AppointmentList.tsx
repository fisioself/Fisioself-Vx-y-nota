import { useState } from 'react';
import { calendarService } from '../../services/calendarService';
import { clinicalApi } from '../../services/clinicalApi';
import { AppointmentForm } from './AppointmentForm';
import { getErrorMessage } from '../../shared/errors';
import { useToast } from '../../app/ToastProvider';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { fmtDate } from '../finance/financeUtils';
import type { Appointment, Patient } from '../../types/clinical';
import './appointments.css';

// Hora en CDMX, formato 24h (consistente con el resto de la app).
const cdmxTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Mexico_City'
  });

// La Edge Function de Google Calendar escribe "Paciente: X" en la descripción
// cada vez que sincroniza, acumulando repeticiones. Si el campo solo contiene
// ese texto auto-generado, no lo mostramos para evitar ruido visual.
const userVisibleDesc = (desc: string | null | undefined): string => {
  if (!desc?.trim()) return '';
  return /^(Paciente:\s*.+?\s*)+$/i.test(desc.trim()) ? '' : desc.trim();
};

interface AppointmentListProps {
  patient: Patient;
  appointments?: Appointment[];
  onChanged?: () => void;
}

export function AppointmentList({ patient, appointments = [], onChanged }: AppointmentListProps) {
  const [showForm, setShowForm] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const { notify } = useToast();

  const syncAppointment = async (id: string) => {
    setSyncing(id);
    try {
      await calendarService.syncAppointment(id);
      onChanged?.();
    } catch (err) {
      notify({ tone: 'error', message: getErrorMessage(err, 'No se pudo sincronizar la cita.') });
    } finally {
      setSyncing(null);
    }
  };

  const cancelAppointment = async (id: string) => {
    setConfirmCancelId(null);
    setCancelling(id);
    try {
      await clinicalApi.updateAppointment(id, { status: 'cancelled' });
      onChanged?.();
    } catch (err) {
      notify({ tone: 'error', message: getErrorMessage(err, 'No se pudo cancelar la cita.') });
    } finally {
      setCancelling(null);
    }
  };

  const sendWhatsAppReminder = (appointment: Appointment) => {
    if (!patient?.phone) {
      notify({
        tone: 'warning',
        message: 'El paciente no tiene un número de teléfono registrado.'
      });
      return;
    }

    const date = new Date(appointment.starts_at).toLocaleDateString('es-MX', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'America/Mexico_City'
    });
    const time = cdmxTime(appointment.starts_at);

    const cleanPhone = patient.phone.replace(/\D/g, '');
    const message = `Hola ${(patient.full_name || '').split(' ')[0]}, te recordamos tu cita de Fisioterapia para el ${date} a las ${time}h. ¡Te esperamos!`;
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;

    window.open(url, '_blank');
  };

  // Más reciente primero; canceladas al final.
  const sorted = [...appointments].sort((a, b) => {
    if (a.status === 'cancelled' && b.status !== 'cancelled') return 1;
    if (b.status === 'cancelled' && a.status !== 'cancelled') return -1;
    return new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime();
  });
  const visible = showAll ? sorted : sorted.slice(0, 1);
  const hiddenCount = sorted.length - 1;

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
        {visible.map((appointment) => {
          const isCancelled = appointment.status === 'cancelled';
          const desc = userVisibleDesc(appointment.description);
          return (
            <article
              key={appointment.id}
              className="note-row"
              style={isCancelled ? { opacity: 0.6 } : undefined}
            >
              <div className="form-header">
                <strong>{appointment.title || 'Cita sin titulo'}</strong>
                <div
                  style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}
                >
                  {isCancelled ? (
                    <span className="pill cancelled">Cancelada</span>
                  ) : (
                    <>
                      {patient?.phone && (
                        <button
                          className="secondary btn-sm"
                          onClick={() => sendWhatsAppReminder(appointment)}
                          title="Recordar por WhatsApp"
                          aria-label="Enviar recordatorio por WhatsApp"
                        >
                          WhatsApp
                        </button>
                      )}
                      {appointment.sync_status !== 'synced' && (
                        <button
                          className="secondary btn-sm"
                          disabled={syncing === appointment.id}
                          onClick={() => syncAppointment(appointment.id)}
                        >
                          {syncing === appointment.id ? 'Sincronizando...' : 'Sincronizar'}
                        </button>
                      )}
                      <button
                        className="danger btn-sm"
                        disabled={cancelling === appointment.id}
                        onClick={() => setConfirmCancelId(appointment.id)}
                      >
                        {cancelling === appointment.id ? 'Cancelando...' : 'Cancelar cita'}
                      </button>
                    </>
                  )}
                </div>
              </div>
              <p className="muted">
                {fmtDate(appointment.starts_at)} · {cdmxTime(appointment.starts_at)}
                {appointment.ends_at && ` - ${cdmxTime(appointment.ends_at)}`}
              </p>
              {desc && <p style={{ marginTop: '0.25rem' }}>{desc}</p>}
            </article>
          );
        })}
        {!appointments.length && (
          <EmptyState
            icon="🗓️"
            title="Sin citas programadas"
            hint="Crea una cita con «Nueva cita» para verla aquí y poder enviar recordatorios."
          />
        )}
      </div>

      {hiddenCount > 0 && (
        <div style={{ textAlign: 'center', marginTop: '0.75rem' }}>
          <button type="button" className="secondary" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Ocultar' : `Ver todas las citas (${sorted.length})`}
          </button>
        </div>
      )}

      {confirmCancelId && (
        <ConfirmDialog
          title="Cancelar cita"
          message="¿Cancelar esta cita? Si estaba sincronizada, también se eliminará el evento de tu Google Calendar."
          confirmLabel="Cancelar cita"
          cancelLabel="Volver"
          busy={cancelling === confirmCancelId}
          onConfirm={() => cancelAppointment(confirmCancelId)}
          onCancel={() => setConfirmCancelId(null)}
        />
      )}
    </section>
  );
}
