import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { clinicalApi } from '../../services/clinicalApi';
import { useToast } from '../../app/ToastProvider';
import { getErrorMessage } from '../../shared/errors';
import { VALORACION_COLOR_ID } from '../../services/sessionColors';
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
// agenda al importar): null = sesión clínica (color por defecto), Valoración =
// morado (Grape, '3'), Domicilio = naranja, Descarga = amarillo, Cortesía = gris.
interface SessionTypeOption {
  label: string;
  colorId: string | null;
}
const SESSION_TYPES: SessionTypeOption[] = [
  { label: 'Sesión clínica', colorId: null },
  { label: 'Valoración', colorId: VALORACION_COLOR_ID },
  { label: 'Domicilio', colorId: '6' },
  { label: 'Descarga', colorId: '5' },
  { label: 'Cortesía', colorId: '8' }
];

// "YYYY-MM-DDTHH:mm" para <input datetime-local> a partir de lo que da
// FullCalendar (hora de pared local, sin zona).
const toLocalInput = (s: string) => s.slice(0, 16);

// Normaliza un nombre (sin acentos ni mayúsculas) para detectar si el paciente
// que se va a crear ya existe y evitar fichas duplicadas por error.
const normName = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function AppointmentCreateModal({ slot, onClose }: AppointmentCreateModalProps) {
  const { notify } = useToast();
  const queryClient = useQueryClient();

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [patient, setPatient] = useState<Patient | null>(null);
  const [sessionTypeIdx, setSessionTypeIdx] = useState(0);
  const [startLocal, setStartLocal] = useState('');
  const [endLocal, setEndLocal] = useState('');
  const [saving, setSaving] = useState(false);
  const [creatingPatient, setCreatingPatient] = useState(false);
  // Cuando el nombre escrito coincide con un paciente que ya existe, pedimos
  // una confirmación extra antes de crear una ficha nueva (evita duplicados).
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const [error, setError] = useState('');

  // Reinicia el formulario cada vez que se abre con un slot nuevo.
  useEffect(() => {
    if (!slot) return;
    setQuery('');
    setDebouncedQuery('');
    setPatient(null);
    setSessionTypeIdx(0);
    setStartLocal(toLocalInput(slot.start));
    setEndLocal(toLocalInput(slot.end));
    setConfirmDuplicate(false);
    setError('');
  }, [slot]);

  // Si cambia lo que se escribe, se reinicia la confirmación de duplicado.
  useEffect(() => {
    setConfirmDuplicate(false);
  }, [query]);

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

  // ¿El nombre escrito ya corresponde a un paciente existente en los resultados?
  // Si es así, avisamos antes de crear otra ficha para no duplicar pacientes.
  const duplicate = results.find((p) => normName(p.full_name ?? '') === normName(query));

  // Crea un paciente nuevo con el nombre escrito y lo selecciona para la cita.
  // Sirve para agendar a alguien que aún no existe en el sistema (primera vez),
  // sin tener que salir a la pantalla de pacientes.
  const createNewPatient = async () => {
    const name = query.trim();
    if (name.length < 2) {
      setError('Escribe el nombre del paciente nuevo.');
      return;
    }
    // Si ya existe alguien con ese nombre, primero pedimos confirmación.
    if (duplicate && !confirmDuplicate) {
      setConfirmDuplicate(true);
      return;
    }
    setCreatingPatient(true);
    setError('');
    try {
      const nuevo = await clinicalApi.createPatient({ full_name: name });
      setPatient(nuevo);
      setQuery('');
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo crear el paciente.'));
    } finally {
      setCreatingPatient(false);
    }
  };

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
    // full_name es NOT NULL en la práctica, pero el tipo lo marca como string|null.
    // El fallback evita rechazar el INSERT si algún registro antiguo tiene nombre vacío.
    const finalTitle = patient.full_name ?? patient.id;
    setSaving(true);
    try {
      await clinicalApi.addAppointment({
        patient_id: patient.id,
        title: finalTitle,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        session_type: sessionType.label,
        color_id: sessionType.colorId
      });

      // La sincronización a Google Calendar la hace el trigger server-side
      // (appointments_autosync), de forma confiable y SIN depender de que el
      // token del móvil esté vigente. Ya no la disparamos desde aquí para
      // evitar una carrera que podía duplicar el evento en Google.
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
      notify({
        tone: 'success',
        message: 'Cita agendada. Se sincroniza con Google Calendar automáticamente.'
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
              placeholder="Buscar paciente existente o escribir uno nuevo…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query.trim().length >= 2 && (
              <ul className="appt-create-results">
                {results.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        setPatient(p);
                        setQuery('');
                      }}
                    >
                      {p.full_name}
                      {p.phone ? ` · ${p.phone}` : ''}
                    </button>
                  </li>
                ))}
                {/* Siempre se puede agendar como paciente NUEVO con el nombre
                    escrito, exista o no en la búsqueda. Si ya existe alguien con
                    ese nombre, se pide confirmar para no duplicar la ficha. */}
                <li>
                  <button
                    type="button"
                    onClick={createNewPatient}
                    disabled={creatingPatient}
                    style={{ width: '100%', textAlign: 'left' }}
                  >
                    {creatingPatient
                      ? 'Creando…'
                      : confirmDuplicate
                        ? `⚠️ Ya existe «${query.trim()}». Toca otra vez para crear uno aparte`
                        : `+ Paciente nuevo: «${query.trim()}»`}
                  </button>
                  {confirmDuplicate && (
                    <p className="muted" style={{ fontSize: '0.8rem', margin: '4px 2px 0' }}>
                      Si es la misma persona, mejor selecciónala de la lista de arriba.
                    </p>
                  )}
                </li>
              </ul>
            )}
          </label>
        )}

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

        <div className="appt-create-times">
          <label>
            Inicio
            <input
              type="datetime-local"
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
            />
          </label>
          <label>
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
