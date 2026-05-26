import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.js';

const connectUrl = import.meta.env.VITE_GOOGLE_CALENDAR_CONNECT_URL;
const syncUrl = import.meta.env.VITE_GOOGLE_CALENDAR_SYNC_URL;

const getAccessToken = async () => {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase no esta configurado.');
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error('Inicia sesion antes de usar Google Calendar.');
  return token;
};

export const isGoogleCalendarConfigured = Boolean(connectUrl && syncUrl);

export const calendarService = {
  async startGoogleConnection() {
    if (!connectUrl) throw new Error('Falta configurar VITE_GOOGLE_CALENDAR_CONNECT_URL.');
    const token = await getAccessToken();
    const response = await fetch(connectUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'No se pudo iniciar Google Calendar.');
    if (!data.url) throw new Error('La funcion no devolvio URL de Google.');
    window.open(data.url, '_blank', 'noopener,noreferrer');
    return data.url;
  },

  async syncAppointment(appointmentId) {
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
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'No se pudo sincronizar cita.');
    return data.appointment;
  },

  async getConnectionStatus() {
    if (!isSupabaseConfigured || !supabase) return { connected: false, email: null };
    const { data, error } = await supabase.rpc('my_calendar_connection');
    if (error) throw new Error(error.message || 'No se pudo consultar el estado de Google Calendar.');
    const row = Array.isArray(data) ? data[0] : data;
    return row && row.connected
      ? { connected: true, email: row.email ?? null }
      : { connected: false, email: null };
  }
};
