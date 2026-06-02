import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { clinicalApi } from '../../services/clinicalApi';
import { calendarService } from '../../services/calendarService';
import { useToast } from '../../app/ToastProvider';
import { getErrorMessage } from '../../shared/errors';
import type { Patient } from '../../types/clinical';
import './AppointmentCreateModal.css';

export interface NewAppointmentSlot {
  start: string; // ISO o "YYYY-MM-DDTHH:mm:ss" desde FullCalendar
  end: string;
}

interface AppointmentCreateModalProps {
  slot: NewAppointmentSlot | null;
  onClose: () => void;
}

// Tipos de sesión con su color de Google Calendar (mismo convenio que usa la
// agenda al importar): null = sesión clínica (azul), 9 = valoración, etc.
interface SessionTypeOption {
  label: string;
  colorId: string | null;
}
const SESSION_TYPES: SessionTypeOption[] = [
  { label: 'Sesión clínica', colorId: null },
  { label: 'Valoración', colorId: '9' },
  { label: 'Domicilio', colorId: '6' },
  { label: 'Descarga', colorId: '5' },
  { label: 'Cortesía', colorId: '8' }
];

// "YYYY-MM-DDTHH:mm" para <input datetime-local> a partir de lo que da
// FullCalendar (hora de pared local, sin zona).
const toLocalInput = (s: string) => s.slice(0, 16);

export function AppointmentCreateModal({ slot, onClose }: AppointmentCreateModalProps) {
  const { notify } = useToast();
  const queryClient = useQueryClient();

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [patient, setPatient] = useState<Patient | null>(null);
  const [title, setTitle] = useState('');
  const [sessionTypeIdx, setSessionTypeIdx] = useState(0);
  const [startLocal, setStartLocal] = useState('');
  const [endLocal, setEndLocal] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Reinicia el formulario cada vez que se abre con un slot nuevo.
  useEffect(() => {
    if (!slot) return;
    setQuery('');
    setDebouncedQuery('');
    setPatient(null);
    setTitle('');
    setSessionTypeIdx(0);
    setStartLocal(toLocalInput(slot.start));
    setEndLocal(toLocalInput(slot.end));
    setError('');
  }, [slot]);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(handler);
  }, [query]);

  const { data: results = [] } = useQuery({
    queryKey: ['appt-create-patient-search', debouncedQuery],
    queryFn: () => clinicalApi.searchPatients(debouncedQuery),
    enabled: debouncedQuery.trim().length >= 2
  });

  if (!slot) return null;

  const create = async () => {
    setError('');
    if (!patient?.id) {
      setError('Selecciona un paciente.');
      return;
    }
    if (!startLocal || !endLocal) {
      setError('Indica inicio y fin.');
      return;
    }
    const startsAt = new Date(startLocal);
    const endsAt = new Date(endLocal);
    if (!(endsAt.getTime() > startsAt.getTime())) {
      setError('El fin debe ser posterior al inicio.');
      return;
    }

    const sessionType = SESSION_TYPES[sessionTypeIdx];
    // El título es exactamente lo que el usuario escribió (lo que verá en
    // Google); si lo deja vacío, usamos el nombre del paciente como respaldo.
    const finalTitle = title.trim() || patient.full_name;
    setSaving(true);
    try {
      const appt = await clinicalApi.addAppointment({
        patient_id: patient.id,
        title: finalTitle,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        session_type: sessionType.label,
        color_id: sessionType.colorId
      });

      // Empuja la cita a Google Calendar con la sesión del usuario. Si falla
      // (p. ej. Google no conectado) la cita queda guardada igual en la app.
      // Mostramos el motivo REAL del fallo para poder diagnosticar (antes se
      // ocultaba con un mensaje genérico y no se sabía qué pasaba).
      let googleErr: string | null = null;
      try {
        await calendarService.syncAppointment(appt.id);
      } catch (e) {
        googleErr = getErrorMessage(e, 'Error desconocido al enviar a Google.');
      }

      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
      notify({
        tone: googleErr ? 'info' : 'success',
        message: googleErr
          ? `Cita agendada en la app, pero Google falló: ${googleErr}`
          : 'Cita agendada y enviada a Google Calendar.'
      });
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo agendar la cita.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="appt-create-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="appt-create-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="appt-create-title"
      >
        <div className="form-header">
          <div>
            <p className="eyebrow">Nueva cita</p>
            <h2 id="appt-create-title" style={{ marginBottom: 0 }}>
              Agendar
            </h2>
          </div>
          <button type="button" className="secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>

        {patient ? (
          <div className="appt-create-patient">
            <span>
              <strong>{patient.full_name}</strong>
              {patient.phone ? ` · ${patient.phone}` : ''}
            </span>
            <button type="button" className="secondary" onClick={() => setPatient(null)}>
              Cambiar
            </button>
          </div>
        ) : (
          <label>
            Paciente
            <input
              type="search"
              placeholder="Buscar por nombre o teléfono…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {debouncedQuery.trim().length >= 2 && (
              <ul className="appt-create-results">
                {results.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        setPatient(p);
                        setTitle((t) => t || p.full_name || '');
                        setQuery('');
                      }}
                    >
                      {p.full_name}
                      {p.phone ? ` · ${p.phone}` : ''}
                    </button>
                  </li>
                ))}
                {results.length === 0 && <li className="muted">Sin resultados.</li>}
              </ul>
            )}
          </label>
        )}

        <label>
          Título (lo que verás en Google Calendar)
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ej. Juan Pérez #3"
          />
        </label>

        <label>
          Tipo de sesión
          <select
            value={sessionTypeIdx}
            onChange={(e) => setSessionTypeIdx(Number(e.target.value))}
          >
            {SESSION_TYPES.map((s, i) => (
              <option key={s.label} value={i}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <div style={{ display: 'flex', gap: 12 }}>
          <label style={{ flex: 1 }}>
            Inicio
            <input
              type="datetime-local"
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
            />
          </label>
          <label style={{ flex: 1 }}>
            Fin
            <input
              type="datetime-local"
              value={endLocal}
              onChange={(e) => setEndLocal(e.target.value)}
            />
          </label>
        </div>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div className="actions">
          <button type="button" onClick={create} disabled={saving}>
            {saving ? 'Agendando…' : 'Agendar cita'}
          </button>
        </div>
      </section>
    </div>
  );
}
