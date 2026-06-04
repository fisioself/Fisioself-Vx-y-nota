import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jsonResponse, buildCorsHeaders } from '../_shared/cors.ts';
import { getCalendarTokens, setCalendarTokens } from '../_shared/calendarTokens.ts';

const json = (req: Request, status: number, body: unknown) => jsonResponse(req, status, body);
const GENERIC_SYNC_ERROR = 'No se pudo sincronizar la cita. Intenta de nuevo mas tarde.';
const SAFE_EVENT_SUMMARY = 'Cita Fisioself';
const SAFE_EVENT_DESCRIPTION = 'Ver detalles en Fisioself.';

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
  if (!response.ok) {
    console.error('google_token_refresh_failed', {
      status: response.status,
      code: data.error || 'unknown'
    });
    throw new Error('No se pudo refrescar token Google');
  }
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
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const appointmentId = typeof body.appointment_id === 'string' ? body.appointment_id : null;
    if (!appointmentId) return json(req, 400, { error: 'Falta appointment_id' });

    const { data: appointment, error: appointmentError } = await supabase
      .from('appointments')
      .select('*, patients(clinic_id)')
      .eq('id', appointmentId)
      .single();

    if (appointmentError || !appointment) return json(req, 404, { error: 'Cita no encontrada' });
    if (appointment.sync_status === 'disabled')
      return json(req, 400, { error: 'La cita no esta habilitada para Google Calendar' });

    const CONNECTION_COLUMNS = 'id, calendar_id, token_expires_at, access_token, refresh_token';
    const calendarKey = appointment.google_calendar_id || 'primary';

    interface ConnRow {
      id: string;
      calendar_id: string | null;
      token_expires_at: string | null;
      access_token: string | null;
      refresh_token: string | null;
    }

    // --- Autenticación: secret del trigger DB (server-side) o JWT del usuario (app) ---
    // Modo secret: el trigger appointments_autosync envía x-sync-secret para que
    // CADA cita creada/movida en la app se empuje a Google de forma confiable,
    // sin depender de que el token del móvil esté vigente en ese instante.
    const syncSecret = req.headers.get('x-sync-secret');
    let actorId: string | null = null;
    let connection: ConnRow | null = null;

    if (syncSecret) {
      const { data: cfg } = await supabase
        .from('integration_config')
        .select('value')
        .eq('key', 'gcal_autosync_secret')
        .single();
      if (!cfg || cfg.value !== syncSecret) return json(req, 401, { error: 'Secret invalido' });

      actorId = appointment.created_by ?? null;
      // Conexión del dueño de la cita; si no, cualquier conexión Google de ese
      // calendario (clínica de un solo terapeuta = una sola conexión).
      let q = supabase
        .from('calendar_connections')
        .select(CONNECTION_COLUMNS)
        .eq('provider', 'google')
        .eq('calendar_id', calendarKey);
      if (appointment.created_by) q = q.eq('user_id', appointment.created_by);
      const owner = await q.maybeSingle();
      connection = (owner.data as ConnRow | null) ?? null;
      if (!connection) {
        const anyConn = await supabase
          .from('calendar_connections')
          .select(CONNECTION_COLUMNS)
          .eq('provider', 'google')
          .eq('calendar_id', calendarKey)
          .limit(1)
          .maybeSingle();
        connection = (anyConn.data as ConnRow | null) ?? null;
      }
    } else {
      const token = getBearerToken(req);
      if (!token) return json(req, 401, { error: 'Falta autorizacion' });
      const { data: userData, error: userError } = await supabase.auth.getUser(token);
      if (userError || !userData.user) return json(req, 401, { error: 'Sesion invalida' });
      actorId = userData.user.id;

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

      const { data: conn } = await supabase
        .from('calendar_connections')
        .select(CONNECTION_COLUMNS)
        .eq('user_id', userData.user.id)
        .eq('provider', 'google')
        .eq('calendar_id', calendarKey)
        .single();
      connection = (conn as ConnRow | null) ?? null;
    }

    if (!connection) {
      await supabase
        .from('appointments')
        .update({ sync_status: 'failed', sync_error: 'Google Calendar no conectado' })
        .eq('id', appointmentId);
      return json(req, 400, { error: 'Google Calendar no conectado' });
    }

    // Tokens descifrados vía RPC (con respaldo a texto plano durante la transición).
    const tokens = await getCalendarTokens(supabase, connection.id, connection);
    let accessToken: string | null = tokens.access_token;
    const refreshTokenStored: string | null = tokens.refresh_token;

    if (
      !accessToken ||
      new Date(connection.token_expires_at || 0) <= new Date(Date.now() + 60_000)
    ) {
      if (!refreshTokenStored) throw new Error('Falta refresh token de Google');
      const refreshed = await refreshGoogleToken({
        refreshToken: refreshTokenStored,
        clientId: googleClientId,
        clientSecret: googleClientSecret
      });
      accessToken = refreshed.access_token;
      // El access token (secreto) se guarda cifrado; el refresh se preserva igual.
      await setCalendarTokens(supabase, connection.id, accessToken, refreshTokenStored);
      await supabase
        .from('calendar_connections')
        .update({
          token_expires_at: new Date(
            Date.now() + Number(refreshed.expires_in || 3600) * 1000
          ).toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', connection.id);
    }

    // Location is the only event field that still passes through user-entered
    // text into Google Calendar. summary and description are forced to safe
    // constants above. To prevent accidental PHI leakage if someone wires up
    // an appointments form again and puts a patient address in here, we cap
    // the field to a short clinic-friendly length and never forward anything
    // that looks paragraph-sized.
    const MAX_LOCATION_LEN = 120;
    const rawLocation = typeof appointment.location === 'string' ? appointment.location.trim() : '';
    const safeLocation =
      rawLocation && rawLocation.length <= MAX_LOCATION_LEN ? rawLocation : undefined;

    // Al CREAR desde la app, el evento de Google muestra exactamente el título
    // que el usuario escribió (appointment.title). Seguimos SIN enviar notas
    // clínicas: la descripción permanece genérica. En updates (mover/
    // redimensionar) NO reescribimos el título para no pisar lo que el usuario
    // tenga en Google.
    const isCreate = !appointment.google_event_id;
    const userTitle = typeof appointment.title === 'string' ? appointment.title.trim() : '';

    // id determinístico (UUID sin guiones = base32hex válido para Google). Hace
    // que dos sincronizaciones concurrentes de la MISMA cita (trigger DB + app)
    // no creen eventos duplicados: la segunda recibe 409 y se trata como éxito.
    const detEventId = String(appointment.id).replace(/-/g, '');

    const eventPayload = isCreate
      ? {
          id: detEventId,
          summary: userTitle || SAFE_EVENT_SUMMARY,
          location: safeLocation,
          description: SAFE_EVENT_DESCRIPTION,
          start: { dateTime: appointment.starts_at },
          end: { dateTime: appointment.ends_at }
        }
      : {
          location: safeLocation,
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

    let googleData = await googleResponse.json().catch(() => ({}));
    // 409 al crear = el evento ya existe con ese id determinístico (lo creó otra
    // sincronización concurrente de esta misma cita). No es error: ya está en Google.
    if (!googleResponse.ok && isCreate && googleResponse.status === 409) {
      googleData = { id: detEventId, htmlLink: appointment.google_html_link ?? null };
    } else if (!googleResponse.ok) {
      console.error('google_calendar_sync_rejected', {
        status: googleResponse.status,
        code: googleData.error?.code || googleData.error?.status || 'unknown'
      });
      await supabase
        .from('appointments')
        .update({ sync_status: 'failed', sync_error: GENERIC_SYNC_ERROR })
        .eq('id', appointmentId);
      return json(req, googleResponse.status, { error: GENERIC_SYNC_ERROR });
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
      actor_id: actorId,
      action: 'appointment.google_synced',
      entity_type: 'appointments',
      entity_id: appointmentId,
      after_json: updated
    });

    return json(req, 200, { appointment: updated });
  } catch (error) {
    console.error('google_calendar_sync_failed', {
      name: error instanceof Error ? error.name : 'UnknownError'
    });
    return json(req, 500, { error: GENERIC_SYNC_ERROR });
  }
});
