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

// Color → tipo de sesión, según el código de color de Google Calendar:
//   3 (Grape/Morado)        → Valoración
//   5 (Banana/Amarillo)     → Descarga muscular
//   4/6 (Flamingo/Tangerine, Naranja) → Terapia a domicilio
//   1/7/9 (Lavender/Peacock/Blueberry, Azul) → Sesión clínica (rehabilitación)
const resolveSessionType = (colorId?: string) => {
  switch (colorId) {
    case '3':
      return 'Valoración';
    case '5':
      return 'Descarga muscular';
    case '4':
    case '6':
      return 'Terapia a domicilio';
    case '1':
    case '7':
    case '9':
      return 'Sesión clínica';
    default:
      return 'Sesión clínica';
  }
};

// Extract a 7-or-more digit phone number embedded in an event title.
const extractPhone = (raw: string): string | null => {
  const match = raw.match(/(\d{7,})/);
  return match ? match[1] : null;
};

// Return a cleaned display name: strip trailing "#N" session counter and any
// embedded phone number, then collapse extra whitespace.
const cleanDisplayName = (raw: string): string =>
  raw
    .trim()
    .replace(/#\s*\d+\s*$/, '')
    .replace(/\d{7,}/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

// Normalised key used for matching — lower-case, accent-free, digits removed.
const normalizeKey = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .toLowerCase()
    .trim();

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

    // Fetch connection including token columns directly (no calendar_tokens_get RPC)
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
      // Write refreshed tokens directly to columns
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

    // Routine sync window: last 2 months through next 6 months. This keeps the
    // on-mount sync fast (the full historical backfill was a one-time import).
    // Paginate via nextPageToken in case a window ever exceeds one page.
    const calendarId = encodeURIComponent(connection.calendar_id || 'primary');
    const timeMin = new Date();
    timeMin.setMonth(timeMin.getMonth() - 2);
    const timeMax = new Date();
    timeMax.setMonth(timeMax.getMonth() + 6);

    const baseEndpoint =
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events` +
      `?timeMin=${timeMin.toISOString()}&timeMax=${timeMax.toISOString()}` +
      `&singleEvents=true&orderBy=startTime&maxResults=2500`;

    const events: Array<Record<string, unknown>> = [];
    let pageToken: string | undefined;
    do {
      const endpoint = pageToken
        ? `${baseEndpoint}&pageToken=${encodeURIComponent(pageToken)}`
        : baseEndpoint;
      const googleResponse = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const googleData = await googleResponse.json();
      if (!googleResponse.ok) {
        return json(req, googleResponse.status, { error: 'Error fetching Google Calendar' });
      }
      if (Array.isArray(googleData.items)) events.push(...googleData.items);
      pageToken = googleData.nextPageToken;
    } while (pageToken);

    let syncedCount = 0;

    // Load all existing patients once to avoid N+1 lookups
    const { data: allPatients } = await supabase.from('patients').select('id, full_name, created_at');
    const patientsByKey = new Map<string, { id: string; created_at: string }>();
    for (const p of allPatients || []) {
      if (!p.full_name) continue;
      const key = normalizeKey(p.full_name);
      const existing = patientsByKey.get(key);
      // Keep the oldest record per normalized key
      if (!existing || new Date(p.created_at) < new Date(existing.created_at)) {
        patientsByKey.set(key, { id: p.id, created_at: p.created_at });
      }
    }

    for (const event of events) {
      if (event.status === 'cancelled') continue;

      const rawTitle = (event.summary as string | undefined)?.trim();
      if (!rawTitle) continue;

      const start = event.start as Record<string, string> | undefined;
      const end = event.end as Record<string, string> | undefined;
      const startsAt = start?.dateTime || start?.date;
      const endsAt = end?.dateTime || end?.date;
      if (!startsAt || !endsAt) continue;

      const displayName = cleanDisplayName(rawTitle);
      const phone = extractPhone(rawTitle);
      const nameKey = normalizeKey(displayName);

      // Resolve or create patient using normalised key
      let patientId: string;
      const existingEntry = patientsByKey.get(nameKey);

      if (existingEntry) {
        patientId = existingEntry.id;
        // Backfill phone if we extracted one and the patient doesn't have it yet
        if (phone) {
          await supabase
            .from('patients')
            .update({ phone })
            .eq('id', patientId)
            .is('phone', null);
        }
      } else {
        const { data: newPatient, error: pError } = await supabase
          .from('patients')
          .insert({ full_name: displayName, phone: phone ?? null, created_by: userId })
          .select('id, created_at')
          .single();

        if (pError) {
          console.error('Error creating patient', pError);
          continue;
        }
        patientId = newPatient.id;
        patientsByKey.set(nameKey, { id: newPatient.id, created_at: newPatient.created_at });
      }

      const colorId = (event.colorId as string | undefined) || null;

      // Upsert appointment by google_event_id
      const { data: existingAppt } = await supabase
        .from('appointments')
        .select('id')
        .eq('google_event_id', event.id as string)
        .limit(1);

      const appointmentPayload = {
        patient_id: patientId,
        title: displayName,
        description: (event.description as string | undefined) || '',
        location: (event.location as string | undefined) || '',
        starts_at: startsAt,
        ends_at: endsAt,
        status: 'scheduled',
        google_calendar_id: connection.calendar_id || 'primary',
        google_event_id: event.id as string,
        google_html_link: event.htmlLink as string | undefined,
        sync_status: 'synced',
        color_id: colorId,
        session_type: resolveSessionType(colorId ?? undefined),
        updated_at: new Date().toISOString()
      };

      if (existingAppt && existingAppt.length > 0) {
        await supabase.from('appointments').update(appointmentPayload).eq('id', existingAppt[0].id);
      } else {
        await supabase.from('appointments').insert({ ...appointmentPayload, created_by: userId });
      }
      syncedCount++;
    }

    return json(req, 200, { success: true, count: syncedCount });
  } catch (error) {
    console.error('google-calendar-fetch-error', error);
    return json(req, 500, { error: 'Internal Server Error' });
  }
});
