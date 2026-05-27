import React, { useMemo, useState, useCallback, useEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { calendarService } from '../../services/calendarService';
import { useToast } from '../../app/ToastProvider';
import './NativeCalendar.css';

const colorMap: Record<string, string> = {
  '1': '#7986cb', // Lavender (Azul claro)
  '2': '#33b679', // Sage (Verde)
  '3': '#8e24aa', // Grape (Morado - Valoración)
  '4': '#e67c73', // Flamingo (Naranja/Salmón - Domicilio)
  '5': '#f6c026', // Banana (Amarillo - Descarga)
  '6': '#f4511e', // Tangerine (Naranja fuerte)
  '7': '#039be5', // Peacock (Azul claro)
  '8': '#616161', // Graphite (Gris)
  '9': '#3f51b5', // Blueberry (Azul oscuro - Clínica)
  '10': '#0b8043', // Basil (Verde oscuro)
  '11': '#d50000', // Tomato (Rojo)
};

const resolveColor = (colorId?: string | null) => {
  if (!colorId) return '#3788d8'; // Default FullCalendar blue
  return colorMap[colorId] || '#3788d8';
};

interface NativeCalendarProps {
  onEventClick?: (patientId: string) => void;
}

export function NativeCalendar({ onEventClick }: NativeCalendarProps) {
  const [syncing, setSyncing] = useState(false);
  const { notify } = useToast();
  const queryClient = useQueryClient();

  const { data: appointments = [], isLoading, error } = useQuery({
    queryKey: ['all_appointments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select('id, title, starts_at, ends_at, color_id, session_type, patient_id')
        .neq('status', 'cancelled');
      if (error) throw error;
      return data;
    }
  });

  const syncWithGoogle = useCallback(async () => {
    setSyncing(true);
    notify({ tone: 'success', message: 'Sincronizando con Google Calendar...' });
    try {
      const { data, error } = await supabase.functions.invoke('google-calendar-fetch');
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      notify({ tone: 'success', message: `Sincronizados ${data.count || 0} eventos de Google.` });
      queryClient.invalidateQueries({ queryKey: ['all_appointments'] });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
    } catch (err: any) {
      console.error(err);
      notify({ tone: 'error', message: err.message || 'Error al sincronizar con Google Calendar.' });
    } finally {
      setSyncing(false);
    }
  }, [notify, queryClient]);

  // Initial sync on mount
  useEffect(() => {
    syncWithGoogle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const events = useMemo(() => {
    return appointments.map(appt => ({
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

  const handleEventClick = (clickInfo: any) => {
    const patientId = clickInfo.event.extendedProps.patientId;
    if (patientId && onEventClick) {
      onEventClick(patientId);
    }
  };

  const handleEventDrop = async (dropInfo: any) => {
    const { event } = dropInfo;
    const apptId = event.id;
    const newStart = event.startStr;
    const newEnd = event.endStr;
    
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ starts_at: newStart, ends_at: newEnd })
        .eq('id', apptId);
      
      if (error) throw error;
      
      // Sincronización bidireccional (Punto 1): Empujar el cambio de vuelta a Google Calendar
      await calendarService.syncAppointment(apptId);
      
      notify({ tone: 'success', message: 'Cita movida y sincronizada con Google.' });
    } catch (err: any) {
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
        <button 
          onClick={syncWithGoogle} 
          disabled={syncing}
          className="secondary"
        >
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
            height="auto"
            slotMinTime="06:00:00"
            slotMaxTime="22:00:00"
            allDaySlot={false}
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
    </div>
  );
}
