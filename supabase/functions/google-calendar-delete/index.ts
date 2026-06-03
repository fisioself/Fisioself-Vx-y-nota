import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jsonResponse, buildCorsHeaders } from '../_shared/cors.ts';

const json = (req: Request, status: number, body: unknown) => jsonResponse(req, status, body);
const GENERIC_ERROR = 'No se pudo eliminar la cita. Intenta de nuevo más tarde.';

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
  if (!response.ok) throw new Error('No se pudo refrescar token Google');
  return data;
};

// Borra una cita TANTO de Google Calendar COMO de la app. Hacerlo en el mismo
// paso evita que el cron de importación (google-calendar-fetch) vuelva a crear
// la cita: si solo la borráramos en la app, el evento seguiría en Google y se
// re-importaría en el siguiente ciclo. Por eso primero quitamos el evento de
// Google y solo entonces eliminamos la fila local.
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

    // --- Autenticación del usuario de la app (JWT) + permiso en la clínica ---
    const token = getBearerToken(req);
    if (!token) return json(req, 401, { error: 'Falta autorizacion' });
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) return json(req, 401, { error: 'Sesion invalida' });
    const actorId = userData.user.id;

    const { data: appointment, error: appointmentError } = await supabase
      .from('appointments')
      .select('*, patients(clinic_id)')
      .eq('id', appointmentId)
      .single();
    if (appointmentError || !appointment) return json(req, 404, { error: 'Cita no encontrada' });

    const clinicId = appointment.patients?.clinic_id;
    if (!clinicId) return json(req, 403, { error: 'Cita sin clinica autorizada' });

    const { data: membership, error: membershipError } = await supabase
      .from('clinic_memberships')
      .select('role, active')
      .eq('user_id', actorId)
      .eq('clinic_id', clinicId)
      .single();
    if (
      membershipError ||
      !membership?.active ||
      !['admin', 'therapist'].includes(membership.role)
    ) {
      return json(req, 403, { error: 'No tienes permiso para eliminar esta cita' });
    }

    // --- Borrar el evento de Google (si la cita estaba sincronizada) ---
    if (appointment.google_event_id) {
      const calendarKey = appointment.google_calendar_id || 'primary';
      const { data: conn } = await supabase
        .from('calendar_connections')
        .select('id, calendar_id, token_expires_at, access_token, refresh_token')
        .eq('provider', 'google')
        .eq('calendar_id', calendarKey)
        .limit(1)
        .maybeSingle();

      if (conn) {
        let accessToken: string | null = conn.access_token ?? null;
        if (!accessToken || new Date(conn.token_expires_at || 0) <= new Date(Date.now() + 60_000)) {
          if (conn.refresh_token) {
            const refreshed = await refreshGoogleToken({
              refreshToken: conn.refresh_token,
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
              .eq('id', conn.id);
          }
        }

        if (accessToken) {
          const calendarId = encodeURIComponent(conn.calendar_id || 'primary');
          const eventId = encodeURIComponent(appointment.google_event_id);
          const delResp = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`,
            { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }
          );
          // 404/410 = el evento ya no existe en Google: lo tratamos como éxito.
          if (!delResp.ok && delResp.status !== 404 && delResp.status !== 410) {
            console.error('google_calendar_delete_rejected', { status: delResp.status });
            return json(req, 502, { error: GENERIC_ERROR });
          }
        }
      }
    }

    // --- Borrar la cita de la app (los pagos quedan: FK es SET NULL) ---
    const { error: deleteError } = await supabase
      .from('appointments')
      .delete()
      .eq('id', appointmentId);
    if (deleteError) throw deleteError;

    await supabase.from('audit_log').insert({
      actor_id: actorId,
      action: 'appointment.deleted',
      entity_type: 'appointments',
      entity_id: appointmentId,
      before_json: appointment
    });

    return json(req, 200, { success: true });
  } catch (error) {
    console.error('google_calendar_delete_failed', {
      name: error instanceof Error ? error.name : 'UnknownError'
    });
    return json(req, 500, { error: GENERIC_ERROR });
  }
});
