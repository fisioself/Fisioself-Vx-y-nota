import { useMemo, useState, useCallback, useEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import esLocale from '@fullcalendar/core/locales/es';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { assertSupabase } from '../../lib/supabaseClient';
import { calendarService } from '../../services/calendarService';
import { useToast } from '../../app/ToastProvider';
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
    extendedProps: { patientId?: string; sessionType?: string | null };
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

// `select` se dispara al hacer click/arrastrar sobre un hueco libre del
// calendario; lo usamos para agendar una cita nueva en ese horario.
interface CalendarSelectArg {
  startStr: string;
  endStr: string;
}

// Colores oficiales de Google Calendar (mismos hex que usa Google), para que
// la agenda se vea idéntica a Google. Texto blanco para legibilidad.
const colorMap: Record<string, string> = {
  '1': '#7986cb', // Lavender
  '2': '#33b679', // Sage
  '3': '#8e24aa', // Grape (Morado - Valoración)
  '4': '#e67c73', // Flamingo (Domicilio)
  '5': '#f6bf26', // Banana (Descarga)
  '6': '#f4511e', // Tangerine
  '7': '#039be5', // Peacock
  '8': '#616161', // Graphite
  '9': '#3f51b5', // Blueberry (Clínica)
  '10': '#0b8043', // Basil
  '11': '#d50000' // Tomato
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

export function NativeCalendar({ onEventClick }: NativeCalendarProps) {
  const [syncing, setSyncing] = useState(false);
  const [chargeTarget, setChargeTarget] = useState<ChargeAppointmentTarget | null>(null);
  const [newSlot, setNewSlot] = useState<NewAppointmentSlot | null>(null);
  // Rango de fechas visible en el calendario. Solo cargamos las citas de ese
  // rango (no las 2000+ históricas), así abrir la agenda es rápido y ligero.
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);
  const { notify } = useToast();
  const queryClient = useQueryClient();

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
      const { data, error } = await db.functions.invoke('google-calendar-fetch');
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
          sessionType: appt.session_type
        }
      };
    });
  }, [appointments]);

  const handleEventClick = (clickInfo: CalendarEventClickArg) => {
    const patientId = clickInfo.event.extendedProps.patientId;
    if (!patientId) return;
    // Al tocar una cita se abre el cobro; desde ahí se puede ir al expediente.
    setChargeTarget({
      id: clickInfo.event.id,
      patientId,
      patientName: clickInfo.event.title,
      sessionType: clickInfo.event.extendedProps.sessionType ?? null,
      startsAt: clickInfo.event.startStr
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

      // Sincronizacion bidireccional: empujar el cambio de vuelta a Google Calendar
      await calendarService.syncAppointment(apptId);

      notify({ tone: 'success', message: 'Cita movida y sincronizada con Google.' });
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
      <div className="calendar-header-actions">
        {isFetching && (
          <span className="muted" style={{ marginRight: 'auto', fontSize: '0.85rem' }}>
            Actualizando…
          </span>
        )}
        <button onClick={syncWithGoogle} disabled={syncing} className="secondary">
          {syncing ? 'Sincronizando...' : 'Sincronizar Calendar'}
        </button>
      </div>

      <div className="fc-container">
        <FullCalendar
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
      />

      <AppointmentCreateModal slot={newSlot} onClose={() => setNewSlot(null)} />
    </div>
  );
}
