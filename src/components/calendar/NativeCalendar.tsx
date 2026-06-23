import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import esLocale from '@fullcalendar/core/locales/es';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { assertSupabase } from '../../lib/supabaseClient';
import { useToast } from '../../app/ToastProvider';
import { clinicalApi } from '../../services/clinicalApi';
import {
  AppointmentChargeModal,
  type ChargeAppointmentTarget
} from '../../features/finance/AppointmentChargeModal';
import {
  AppointmentCreateModal,
  type NewAppointmentSlot
} from '../../features/appointments/AppointmentCreateModal';
import './NativeCalendar.css';

// Formas minimas y estructurales de los argumentos que FullCalendar pasa a
// los handlers; evitan `any` sin acoplarnos a los tipos internos de la libreria.
interface CalendarEventClickArg {
  event: {
    id: string;
    title: string;
    startStr: string;
    extendedProps: { patientId?: string; sessionType?: string | null; colorId?: string | null };
  };
}

interface CalendarEventChangeArg {
  event: { id: string; startStr: string; endStr: string };
  revert: () => void;
}

// FullCalendar dispara `datesSet` cuando cambia el rango visible (navegar,
// cambiar de vista). startStr/endStr cubren toda la rejilla visible.
interface CalendarDatesSetArg {
  startStr: string;
  endStr: string;
}

// `select` se dispara al ARRASTRAR sobre un rango libre (elige duración).
interface CalendarSelectArg {
  startStr: string;
  endStr: string;
}

// `dateClick` se dispara con un toque/click simple sobre un hueco. A diferencia
// de `select` (que exige arrastrar y no funciona bien en táctil), este sí
// responde igual en celular y laptop: por eso lo usamos para agendar al picar.
interface CalendarDateClickArg {
  date: Date;
  allDay: boolean;
}

// Colores oficiales de Google Calendar (mismos hex que usa Google), para que
// la agenda se vea idéntica a Google. Texto blanco para legibilidad.
const colorMap: Record<string, string> = {
  '1': '#7986cb', // Lavanda (Valoración histórica)
  '2': '#33b679', // Menta (Pendiente)
  '3': '#8e24aa', // Uva (Morado - Valoración NUEVA)
  '4': '#e67c73', // Flamingo (Dermatofuncional)
  '5': '#f6bf26', // Girasol (Descarga muscular)
  '6': '#f4511e', // Mandarina (Domicilio)
  '7': '#039be5', // Turquesa (Sesión clínica)
  '8': '#616161', // Grafito (Cortesía)
  '9': '#3f51b5', // Índigo (Valoración histórica, azul)
  '10': '#0b8043', // Albahaca (Pendiente)
  '11': '#d50000' // Tomate (Domicilio)
};

const DEFAULT_COLOR = '#039be5'; // Peacock (azul Google por defecto)

const resolveColor = (colorId?: string | null) => {
  if (!colorId) return DEFAULT_COLOR;
  return colorMap[colorId] || DEFAULT_COLOR;
};

// Texto oscuro sobre fondos claros (amarillo, lavanda) y blanco sobre oscuros,
// igual que Google Calendar. Basado en la luminancia del color de fondo.
const textColorFor = (hex: string): string => {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1b1b1b' : '#ffffff';
};

interface NativeCalendarProps {
  onEventClick?: (patientId: string) => void;
}

// Formatea una fecha como "YYYY-MM-DDTHH:mm:00" en hora local (hora de pared,
// sin zona) — el mismo formato que da FullCalendar y que espera el modal.
const fmtLocal = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
};

// Crea un slot de 1 hora a partir de una fecha de inicio.
const slotFrom = (start: Date): NewAppointmentSlot => ({
  start: fmtLocal(start),
  end: fmtLocal(new Date(start.getTime() + 60 * 60 * 1000))
});

// Genera un slot de 1 hora desde la próxima marca de 30 minutos, en hora local,
// para pre-rellenar el modal al tocar "Nueva cita" sin arrastrar en el calendario.
function makeDefaultSlot(): NewAppointmentSlot {
  const now = new Date();
  const roundedMins = Math.ceil((now.getMinutes() + 1) / 30) * 30;
  const start = new Date(now);
  start.setMinutes(roundedMins, 0, 0);
  return slotFrom(start);
}

export function NativeCalendar({ onEventClick }: NativeCalendarProps) {
  const [syncing, setSyncing] = useState(false);
  const [chargeTarget, setChargeTarget] = useState<ChargeAppointmentTarget | null>(null);
  const [newSlot, setNewSlot] = useState<NewAppointmentSlot | null>(null);
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);
  // Buscador de paciente en agenda
  const [patientQuery, setPatientQuery] = useState('');
  const [debouncedPatientQuery, setDebouncedPatientQuery] = useState('');
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);
  const calendarRef = useRef<FullCalendar>(null);
  const { notify } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedPatientQuery(patientQuery), 250);
    return () => clearTimeout(t);
  }, [patientQuery]);

  const { data: patientResults = [] } = useQuery({
    queryKey: ['calendar-patient-search', debouncedPatientQuery],
    queryFn: () => clinicalApi.searchPatients(debouncedPatientQuery),
    enabled: debouncedPatientQuery.trim().length >= 2
  });

  const goToPatientAppointment = useCallback(
    async (patientId: string, patientName: string | null) => {
      setShowPatientDropdown(false);
      setPatientQuery(patientName ?? '');
      try {
        const db = assertSupabase();
        const now = new Date().toISOString();
        // Busca primero la próxima cita futura; si no hay, la más reciente pasada.
        const { data: future } = await db
          .from('appointments')
          .select('starts_at')
          .eq('patient_id', patientId)
          .neq('status', 'cancelled')
          .gte('starts_at', now)
          .order('starts_at', { ascending: true })
          .limit(1);
        const appt = future?.[0] ?? null;
        if (!appt) {
          const { data: past } = await db
            .from('appointments')
            .select('starts_at')
            .eq('patient_id', patientId)
            .neq('status', 'cancelled')
            .lt('starts_at', now)
            .order('starts_at', { ascending: false })
            .limit(1);
          if (!past?.[0]) {
            notify({
              tone: 'error',
              message: `${patientName ?? 'Paciente'} no tiene citas en la agenda.`
            });
            return;
          }
          calendarRef.current?.getApi().gotoDate(new Date(past[0].starts_at));
        } else {
          calendarRef.current?.getApi().gotoDate(new Date(appt.starts_at));
        }
        calendarRef.current?.getApi().changeView('timeGridWeek');
      } catch {
        notify({ tone: 'error', message: 'No se pudo buscar las citas del paciente.' });
      }
    },
    [notify]
  );

  const {
    data: appointments = [],
    isFetching,
    error
  } = useQuery({
    queryKey: ['appointments', range],
    enabled: !!range,
    queryFn: async () => {
      if (!range) return [];
      const db = assertSupabase();
      // Solo el rango visible (una semana/mes/día), nunca todo el histórico.
      // Un rango de ~6 semanas jamás se acerca al límite de 1000 filas.
      const { data, error } = await db
        .from('appointments')
        .select('id, title, starts_at, ends_at, color_id, session_type, patient_id')
        .neq('status', 'cancelled')
        .gte('starts_at', range.start)
        .lt('starts_at', range.end)
        .order('starts_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    }
  });

  const syncWithGoogle = useCallback(async () => {
    setSyncing(true);
    try {
      const db = assertSupabase();
      // Timeout de 20 s: si la Edge Function de Google no responde (red caída,
      // token vencido, función colgada), no dejamos el botón en "Sincronizando…"
      // para siempre. El catch lo trata como fallo no-fatal y libera el estado.
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('La sincronización tardó demasiado.')), 20_000)
      );
      const { data, error } = await Promise.race([
        db.functions.invoke('google-calendar-fetch'),
        timeout
      ]);
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      try {
        sessionStorage.setItem('gcal_auto_synced_at', String(Date.now()));
      } catch {
        // sessionStorage no disponible (privado/iframe) — ignorar
      }
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
    } catch (err) {
      console.warn('Google Calendar Sync Error (Non-fatal):', err);
    } finally {
      setSyncing(false);
    }
  }, [queryClient]);

  // Sincronizacion inicial al montar — con cooldown de 3 min para evitar
  // llamadas redundantes al navegar entre vistas del mismo panel.
  useEffect(() => {
    try {
      const ts = sessionStorage.getItem('gcal_auto_synced_at');
      if (ts && Date.now() - Number(ts) < 3 * 60 * 1000) return;
    } catch {
      // sessionStorage no disponible — sincronizar igualmente
    }
    syncWithGoogle();
  }, [syncWithGoogle]);

  const events = useMemo(() => {
    return appointments.map((appt) => {
      const bg = resolveColor(appt.color_id);
      return {
        id: appt.id,
        title: appt.title,
        start: appt.starts_at,
        end: appt.ends_at,
        backgroundColor: bg,
        borderColor: bg,
        textColor: textColorFor(bg),
        extendedProps: {
          patientId: appt.patient_id,
          sessionType: appt.session_type,
          colorId: appt.color_id
        }
      };
    });
  }, [appointments]);

  // Toque/click simple sobre un hueco → agendar en ese horario. En la vista de
  // mes (allDay) el click no trae hora, así que arrancamos a las 9:00.
  const handleDateClick = (arg: CalendarDateClickArg) => {
    const start = new Date(arg.date);
    if (arg.allDay) start.setHours(9, 0, 0, 0);
    setNewSlot(slotFrom(start));
  };

  const handleEventClick = (clickInfo: CalendarEventClickArg) => {
    const patientId = clickInfo.event.extendedProps.patientId;
    if (!patientId) return;
    // Al tocar una cita se abre el cobro; desde ahí se puede ir al expediente.
    setChargeTarget({
      id: clickInfo.event.id,
      patientId,
      patientName: clickInfo.event.title,
      sessionType: clickInfo.event.extendedProps.sessionType ?? null,
      startsAt: clickInfo.event.startStr,
      colorId: clickInfo.event.extendedProps.colorId ?? null
    });
  };

  const handleEventDrop = async (dropInfo: CalendarEventChangeArg) => {
    const { event } = dropInfo;
    const apptId = event.id;
    const newStart = event.startStr;
    const newEnd = event.endStr;

    try {
      const db = assertSupabase();
      const { error } = await db
        .from('appointments')
        .update({ starts_at: newStart, ends_at: newEnd })
        .eq('id', apptId);

      if (error) throw error;

      // El cambio se empuja a Google con el trigger server-side
      // (appointments_autosync), sin depender del token del móvil.
      notify({ tone: 'success', message: 'Cita movida. Se actualiza en Google automáticamente.' });
    } catch {
      dropInfo.revert();
      notify({ tone: 'error', message: 'No se pudo mover la cita.' });
    }
  };

  if (error) {
    return <p className="error">Error cargando citas: {(error as Error).message}</p>;
  }

  return (
    <div className="native-calendar-wrapper">
      {/* Buscador de paciente → navega a su próxima cita */}
      <div className="cal-patient-search">
        <input
          type="search"
          placeholder="Buscar paciente en agenda…"
          value={patientQuery}
          onChange={(e) => {
            setPatientQuery(e.target.value);
            setShowPatientDropdown(true);
          }}
          onFocus={() => setShowPatientDropdown(true)}
          aria-label="Buscar paciente en agenda"
        />
        {showPatientDropdown && debouncedPatientQuery.trim().length >= 2 && (
          <ul className="cal-patient-dropdown" role="listbox">
            {patientResults.length === 0 ? (
              <li className="cal-patient-empty">Sin coincidencias</li>
            ) : (
              patientResults.map((p) => (
                <li key={p.id} role="option" aria-selected={false}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault(); // evita que el blur cierre antes del click
                      goToPatientAppointment(p.id, p.full_name ?? null);
                    }}
                  >
                    {p.full_name}
                    {p.phone ? <span className="cal-patient-sub">{p.phone}</span> : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      <div className="calendar-header-actions">
        {isFetching && (
          <span className="muted" style={{ marginRight: 'auto', fontSize: '0.85rem' }}>
            Actualizando…
          </span>
        )}
        <button onClick={syncWithGoogle} disabled={syncing} className="secondary">
          {syncing ? 'Sincronizando...' : 'Sincronizar Calendar'}
        </button>
        <button onClick={() => setNewSlot(makeDefaultSlot())}>+ Nueva cita</button>
      </div>

      <div className="fc-container">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'timeGridDay,timeGridWeek,dayGridMonth'
          }}
          datesSet={(arg: CalendarDatesSetArg) =>
            setRange((prev) =>
              prev && prev.start === arg.startStr && prev.end === arg.endStr
                ? prev
                : { start: arg.startStr, end: arg.endStr }
            )
          }
          events={events}
          editable={true}
          selectable={true}
          selectMirror={true}
          select={(arg: CalendarSelectArg) => setNewSlot({ start: arg.startStr, end: arg.endStr })}
          dateClick={handleDateClick}
          dayMaxEvents={true}
          weekends={true}
          hiddenDays={[0]} // Oculta el domingo: la clínica no trabaja ese día
          eventClick={handleEventClick}
          eventDrop={handleEventDrop}
          eventResize={handleEventDrop} // Same logic for resize
          height="auto"
          slotMinTime="08:00:00"
          slotMaxTime="20:00:00"
          allDaySlot={false}
          locales={[esLocale]}
          locale="es"
          buttonText={{
            today: 'Hoy',
            month: 'Mes',
            week: 'Semana',
            day: 'Día'
          }}
        />
      </div>

      <AppointmentChargeModal
        appointment={chargeTarget}
        onClose={() => setChargeTarget(null)}
        onViewPatient={onEventClick}
        onDeleted={() => {
          setChargeTarget(null);
          queryClient.invalidateQueries({ queryKey: ['appointments'] });
        }}
      />

      <AppointmentCreateModal slot={newSlot} onClose={() => setNewSlot(null)} />
    </div>
  );
}
