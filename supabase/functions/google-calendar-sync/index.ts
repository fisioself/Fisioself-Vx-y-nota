import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jsonResponse, buildCorsHeaders } from '../_shared/cors.ts';

const json = (req: Request, status: number, body: unknown) => jsonResponse(req, status, body);

const requireEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} no configurado`);
  return value;
};

const getBearerToken = (req: Request) => {
  const authHeader = req.headers.get('authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
};

const refreshGoogleToken = async ({
  refreshToken,
  clientId,
  clientSecret
}: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}) => {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(data.error_description || data.error || 'No se pudo refrescar token Google');
  return data;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: buildCorsHeaders(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'Metodo no permitido' });

  try {
    const supabaseUrl = requireEnv('SUPABASE_URL');
    const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    const googleClientId = requireEnv('GOOGLE_CLIENT_ID');
    const googleClientSecret = requireEnv('GOOGLE_CLIENT_SECRET');
    const token = getBearerToken(req);

    if (!token) return json(req, 401, { error: 'Falta autorizacion' });

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) return json(req, 401, { error: 'Sesion invalida' });

    const body = await req.json().catch(() => ({}));
    const appointmentId = typeof body.appointment_id === 'string' ? body.appointment_id : null;
    if (!appointmentId) return json(req, 400, { error: 'Falta appointment_id' });

    const { data: appointment, error: appointmentError } = await supabase
      .from('appointments')
      .select(
        '*, patients(full_name, phone, email, medical_diagnosis, functional_diagnosis, clinic_id)'
      )
      .eq('id', appointmentId)
      .single();

    if (appointmentError || !appointment) return json(req, 404, { error: 'Cita no encontrada' });
    if (appointment.sync_status === 'disabled')
      return json(req, 400, { error: 'La cita no esta habilitada para Google Calendar' });

    const clinicId = appointment.patients?.clinic_id;
    if (!clinicId) return json(req, 403, { error: 'Cita sin clinica autorizada' });

    const { data: membership, error: membershipError } = await supabase
      .from('clinic_memberships')
      .select('role, active')
      .eq('user_id', userData.user.id)
      .eq('clinic_id', clinicId)
      .single();
    if (
      membershipError ||
      !membership?.active ||
      !['admin', 'therapist'].includes(membership.role)
    ) {
      return json(req, 403, { error: 'No tienes permiso para sincronizar esta cita' });
    }

    const { data: connection, error: connectionError } = await supabase
      .from('calendar_connections')
      .select('*')
      .eq('user_id', userData.user.id)
      .eq('provider', 'google')
      .eq('calendar_id', appointment.google_calendar_id || 'primary')
      .single();

    if (connectionError || !connection) {
      await supabase
        .from('appointments')
        .update({ sync_status: 'failed', sync_error: 'Google Calendar no conectado' })
        .eq('id', appointmentId);
      return json(req, 400, { error: 'Google Calendar no conectado' });
    }

    let accessToken = connection.access_token;
    if (
      !accessToken ||
      new Date(connection.token_expires_at || 0) <= new Date(Date.now() + 60_000)
    ) {
      if (!connection.refresh_token) throw new Error('Falta refresh token de Google');
      const refreshed = await refreshGoogleToken({
        refreshToken: connection.refresh_token,
        clientId: googleClientId,
        clientSecret: googleClientSecret
      });
      accessToken = refreshed.access_token;
      await supabase
        .from('calendar_connections')
        .update({
          access_token: accessToken,
          token_expires_at: new Date(
            Date.now() + Number(refreshed.expires_in || 3600) * 1000
          ).toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', connection.id);
    }

    const patient = appointment.patients || {};
    const eventPayload = {
      summary: appointment.title,
      location: appointment.location || undefined,
      description: [
        appointment.description,
        '',
        `Paciente: ${patient.full_name || 'No registrado'}`,
        patient.phone ? `Telefono: ${patient.phone}` : null,
        patient.email ? `Correo: ${patient.email}` : null,
        patient.functional_diagnosis ? `Dx funcional: ${patient.functional_diagnosis}` : null
      ]
        .filter(Boolean)
        .join('\n'),
      start: { dateTime: appointment.starts_at },
      end: { dateTime: appointment.ends_at }
    };

    const calendarId = encodeURIComponent(connection.calendar_id || 'primary');
    const method = appointment.google_event_id ? 'PATCH' : 'POST';
    const endpoint = appointment.google_event_id
      ? `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(appointment.google_event_id)}`
      : `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`;

    const googleResponse = await fetch(endpoint, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(eventPayload)
    });

    const googleData = await googleResponse.json().catch(() => ({}));
    if (!googleResponse.ok) {
      const message = googleData.error?.message || 'Google Calendar rechazo la sincronizacion';
      await supabase
        .from('appointments')
        .update({ sync_status: 'failed', sync_error: message })
        .eq('id', appointmentId);
      return json(req, googleResponse.status, { error: message });
    }

    const { data: updated, error: updateError } = await supabase
      .from('appointments')
      .update({
        sync_status: 'synced',
        sync_error: null,
        google_calendar_id: connection.calendar_id || 'primary',
        google_event_id: googleData.id,
        google_html_link: googleData.htmlLink,
        updated_at: new Date().toISOString()
      })
      .eq('id', appointmentId)
      .select('*')
      .single();

    if (updateError) throw updateError;

    await supabase.from('audit_log').insert({
      actor_id: userData.user.id,
      action: 'appointment.google_synced',
      entity_type: 'appointments',
      entity_id: appointmentId,
      after_json: updated
    });

    return json(req, 200, { appointment: updated });
  } catch (error) {
    return json(req, 500, {
      error: error instanceof Error ? error.message : 'Error al sincronizar Google Calendar'
    });
  }
});
