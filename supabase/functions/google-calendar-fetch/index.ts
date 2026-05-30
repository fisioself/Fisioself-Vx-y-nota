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
  if (!response.ok) throw new Error('No se pudo refrescar token Google');
  return data;
};

const resolveSessionType = (colorId?: string) => {
  switch (colorId) {
    case '3':
      return 'Valoración'; // Grape (Morado)
    case '5':
      return 'Descarga muscular'; // Banana (Amarillo)
    case '4':
    case '6':
      return 'Terapia a domicilio'; // Flamingo/Tangerine (Naranja)
    case '1':
    case '9':
      return 'Sesión clínica'; // Lavender/Blueberry (Azul)
    default:
      return 'Sesión clínica';
  }
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

    const userId = userData.user.id;

    // Read connection + tokens directly (access_token/refresh_token are plain columns)
    const { data: connection, error: connectionError } = await supabase
      .from('calendar_connections')
      .select('id, calendar_id, token_expires_at, access_token, refresh_token')
      .eq('user_id', userId)
      .eq('provider', 'google')
      .single();

    if (connectionError || !connection) {
      return json(req, 400, { error: 'Google Calendar no conectado' });
    }

    let accessToken: string | null = connection.access_token ?? null;
    const refreshTokenStored: string | null = connection.refresh_token ?? null;

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

    // Fetch events from Google
    const calendarId = encodeURIComponent(connection.calendar_id || 'primary');
    // Fetch last 3 months and future 6 months
    const timeMin = new Date();
    timeMin.setMonth(timeMin.getMonth() - 3);
    const timeMax = new Date();
    timeMax.setMonth(timeMax.getMonth() + 6);

    const endpoint = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?timeMin=${timeMin.toISOString()}&timeMax=${timeMax.toISOString()}&singleEvents=true&maxResults=500`;

    const googleResponse = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const googleData = await googleResponse.json();

    if (!googleResponse.ok) {
      return json(req, googleResponse.status, { error: 'Error fetching Google Calendar' });
    }

    const events = googleData.items || [];
    let syncedCount = 0;

    // Process each event
    for (const event of events) {
      if (event.status === 'cancelled') continue;

      const title = event.summary?.trim();
      if (!title) continue; // Skip events without title

      const startsAt = event.start?.dateTime || event.start?.date;
      const endsAt = event.end?.dateTime || event.end?.date;
      if (!startsAt || !endsAt) continue;

      // Ensure patient exists
      let patientId;
      const { data: existingPatients } = await supabase
        .from('patients')
        .select('id')
        .ilike('full_name', title)
        .limit(1);

      if (existingPatients && existingPatients.length > 0) {
        patientId = existingPatients[0].id;
      } else {
        const { data: newPatient, error: pError } = await supabase
          .from('patients')
          .insert({ full_name: title, created_by: userId })
          .select('id')
          .single();

        if (pError) {
          console.error('Error creating patient', pError);
          continue;
        }
        patientId = newPatient.id;
      }

      // Check if appointment exists
      const { data: existingAppt } = await supabase
        .from('appointments')
        .select('id')
        .eq('google_event_id', event.id)
        .limit(1);

      if (existingAppt && existingAppt.length > 0) {
        // En UPDATEs solo tocar metadatos de Google — NO campos clínicos
        // (title, starts_at, ends_at, description, location) para que el trigger
        // appointments_autosync no detecte cambios y no llame a google-calendar-sync.
        await supabase
          .from('appointments')
          .update({
            status: 'scheduled',
            google_calendar_id: connection.calendar_id || 'primary',
            google_event_id: event.id,
            google_html_link: event.htmlLink,
            sync_status: 'synced',
            color_id: event.colorId || null,
            session_type: resolveSessionType(event.colorId),
            updated_at: new Date().toISOString()
          })
          .eq('id', existingAppt[0].id);
      } else {
        await supabase.from('appointments').insert({
          patient_id: patientId,
          title: title,
          description: event.description || '',
          location: event.location || '',
          starts_at: startsAt,
          ends_at: endsAt,
          status: 'scheduled',
          google_calendar_id: connection.calendar_id || 'primary',
          google_event_id: event.id,
          google_html_link: event.htmlLink,
          sync_status: 'synced',
          color_id: event.colorId || null,
          session_type: resolveSessionType(event.colorId),
          updated_at: new Date().toISOString(),
          created_by: userId
        });
      }
      syncedCount++;
    }

    return json(req, 200, { success: true, count: syncedCount });
  } catch (error) {
    console.error('google-calendar-fetch-error', error);
    return json(req, 500, { error: 'Internal Server Error' });
  }
});
