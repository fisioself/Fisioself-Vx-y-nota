import { supabase, isSupabaseConfigured, assertSupabase } from '../lib/supabaseClient';
import type { Appointment } from '../types/clinical';

const connectUrl = import.meta.env.VITE_GOOGLE_CALENDAR_CONNECT_URL as string | undefined;
const syncUrl = import.meta.env.VITE_GOOGLE_CALENDAR_SYNC_URL as string | undefined;
const fetchUrl = import.meta.env.VITE_GOOGLE_CALENDAR_FETCH_URL as string | undefined;

export interface GoogleCalendarEvent {
  id: string;
  summary: string | null;
  starts_at: string;
  ends_at: string;
  html_link: string | null;
}

interface ConnectionStatus {
  connected: boolean;
  email: string | null;
}

const getAccessToken = async (): Promise<string> => {
  const db = assertSupabase();
  const { data, error } = await db.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error('Inicia sesion antes de usar Google Calendar.');
  return token;
};

const parseJson = async (response: Response): Promise<Record<string, unknown>> => {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
};

export const calendarService = {
  async startGoogleConnection(): Promise<string> {
    if (!connectUrl) throw new Error('Falta configurar VITE_GOOGLE_CALENDAR_CONNECT_URL.');
    const token = await getAccessToken();
    const response = await fetch(connectUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await parseJson(response);
    if (!response.ok)
      throw new Error((data.error as string) || 'No se pudo iniciar Google Calendar.');
    const url = data.url as string | undefined;
    if (!url) throw new Error('La funcion no devolvio URL de Google.');
    window.open(url, '_blank', 'noopener,noreferrer');
    return url;
  },

  async syncAppointment(appointmentId: string): Promise<Appointment | undefined> {
    if (!syncUrl) throw new Error('Falta configurar VITE_GOOGLE_CALENDAR_SYNC_URL.');
    const token = await getAccessToken();
    const response = await fetch(syncUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ appointment_id: appointmentId })
    });
    const data = await parseJson(response);
    if (!response.ok) throw new Error((data.error as string) || 'No se pudo sincronizar cita.');
    return data.appointment as Appointment | undefined;
  },

  async fetchEvents(
    options: { timeMin?: string; maxResults?: number } = {}
  ): Promise<GoogleCalendarEvent[]> {
    if (!fetchUrl) throw new Error('Falta configurar VITE_GOOGLE_CALENDAR_FETCH_URL.');
    const token = await getAccessToken();
    const response = await fetch(fetchUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        time_min: options.timeMin ?? new Date().toISOString(),
        max_results: options.maxResults ?? 20
      })
    });
    const data = await parseJson(response);
    if (!response.ok) throw new Error((data.error as string) || 'No se pudieron obtener eventos.');
    return (data.events as GoogleCalendarEvent[]) ?? [];
  },

  async getConnectionStatus(): Promise<ConnectionStatus> {
    if (!isSupabaseConfigured || !supabase) return { connected: false, email: null };
    const { data, error } = await supabase.rpc('my_calendar_connection');
    if (error)
      throw new Error(error.message || 'No se pudo consultar el estado de Google Calendar.');
    const row = (Array.isArray(data) ? data[0] : data) as
      | { connected?: boolean; email?: string | null }
      | undefined;
    return row?.connected
      ? { connected: true, email: row.email ?? null }
      : { connected: false, email: null };
  }
};
