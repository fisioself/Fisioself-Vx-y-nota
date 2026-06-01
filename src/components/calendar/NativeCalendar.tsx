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

// Paleta sencilla y legible: tonos sólidos y oscuros que contrastan bien con
// texto blanco. Sin verdes (chocan con el tema) ni amarillos (ilegibles).
const colorMap: Record<string, string> = {
  '1': '#3b6fb0', // Azul
  '2': '#566573', // Gris azulado
  '3': '#7d4ba0', // Morado (Valoración)
  '4': '#b9542e', // Naranja quemado (Domicilio)
  '5': '#a06a1b', // Ámbar oscuro (Descarga)
  '6': '#b9542e', // Naranja quemado
  '7': '#3b6fb0', // Azul
  '8': '#5f6368', // Gris
  '9': '#34507f', // Azul oscuro (Clínica)
  '10': '#566573', // Gris azulado
  '11': '#a83232' // Rojo
};

const DEFAULT_COLOR = '#34507f';

const resolveColor = (colorId?: string | null) => {
  if (!colorId) return DEFAULT_COLOR;
  return colorMap[colorId] || DEFAULT_COLOR;
};

interface NativeCalendarProps {
  onEventClick?: (patientId: string) => void;
}

export function NativeCalendar({ onEventClick }: NativeCalendarProps) {
  const [syncing, setSyncing] = useState(false);
  const [chargeTarget, setChargeTarget] = useState<ChargeAppointmentTarget | null>(null);
  const { notify } = useToast();
  const queryClient = useQueryClient();

  const {
    data: appointments = [],
    isLoading,
    error
  } = useQuery({
    queryKey: ['all_appointments'],
    queryFn: async () => {
      const db = assertSupabase();
      // Supabase/PostgREST limita a 1000 filas por defecto. Con >2000 citas
      // historicas eso dejaba meses recientes vacios. Paginamos en lotes de
      // 1000 con .range() hasta traer todas las citas.
      const PAGE = 1000;
      const all: Array<{
        id: string;
        title: string;
        starts_at: string;
        ends_at: string;
        color_id: string | null;
        session_type: string | null;
        patient_id: string | null;
      }> = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await db
          .from('appointments')
          .select('id, title, starts_at, ends_at, color_id, session_type, patient_id')
          .neq('status', 'cancelled')
          .order('starts_at', { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < PAGE) break;
      }
      return all;
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
      notify({ tone: 'success', message: `Sincronizados ${data.count || 0} eventos de Google.` });
      queryClient.invalidateQueries({ queryKey: ['all_appointments'] });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
    } catch (err) {
      console.warn('Google Calendar Sync Error (Non-fatal):', err);
    } finally {
      setSyncing(false);
    }
  }, [notify, queryClient]);

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
    return appointments.map((appt) => ({
      id: appt.id,
      title: appt.title,
      start: appt.starts_at,
      end: appt.ends_at,
      backgroundColor: resolveColor(appt.color_id),
      borderColor: resolveColor(appt.color_id),
      extendedProps: {
        patientId: appt.patient_id,
        sessionType: appt.session_type
      }
    }));
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
        <button onClick={syncWithGoogle} disabled={syncing} className="secondary">
          {syncing ? 'Sincronizando...' : 'Sincronizar Calendar'}
        </button>
      </div>

      <div className="fc-container">
        {isLoading ? (
          <p className="muted">Cargando agenda...</p>
        ) : (
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'timeGridDay,timeGridWeek,dayGridMonth'
            }}
            events={events}
            editable={true}
            selectable={true}
            selectMirror={true}
            dayMaxEvents={true}
            weekends={true}
            eventClick={handleEventClick}
            eventDrop={handleEventDrop}
            eventResize={handleEventDrop} // Same logic for resize
            eventTextColor="#ffffff"
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
        )}
      </div>

      <AppointmentChargeModal
        appointment={chargeTarget}
        onClose={() => setChargeTarget(null)}
        onViewPatient={onEventClick}
      />
    </div>
  );
}
