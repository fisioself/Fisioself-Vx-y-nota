import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jsonResponse, buildCorsHeaders } from '../_shared/cors.ts';
import { getCalendarTokens, setCalendarTokens } from '../_shared/calendarTokens.ts';

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

// Color → tipo de sesión (código de color de Google Calendar).
// Mapa confirmado contra el calendario real de la clínica:
//   3 (Uva/morado) → Valoración (color actual de las valoraciones nuevas)
//   9 (Índigo/azul) y 1 (Lavanda) → Valoración histórica (antes del morado)
//   5 (Girasol/amarillo)               → Descarga muscular
//   6 (Mandarina) y 11 (Tomate)        → Terapia a domicilio
//   4 (Flamingo/rosa)                  → Dermatofuncional
//   8 (Grafito/gris)                   → Cortesía (no se cobra, fuera de métricas)
//   2 (Menta) y 10 (Albahaca)          → Pendiente (provisional, fuera de métricas)
//   7 (Turquesa), sin color            → Sesión clínica (rehabilitación)
const resolveSessionType = (colorId?: string) => {
  switch (colorId) {
    case '3':
    case '9':
    case '1':
      return 'Valoración';
    case '5':
      return 'Descarga muscular';
    case '6':
    case '11':
      return 'Terapia a domicilio';
    case '4':
      return 'Dermatofuncional';
    case '8':
      return 'Cortesía';
    case '2':
    case '10':
      return 'Pendiente';
    case '7':
    default:
      return 'Sesión clínica';
  }
};

const extractPhone = (raw: string): string | null => {
  const match = raw.match(/(\d{7,})/);
  return match ? match[1] : null;
};

// Nombre para mostrar: quita el contador "#N" y cualquier teléfono incrustado.
const cleanDisplayName = (raw: string): string =>
  raw
    .trim()
    .replace(/#\s*\d+\s*$/, '')
    .replace(/\d{7,}/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

// Clave normalizada para agrupar al mismo paciente (sin acentos, dígitos ni símbolos).
const normalizeKey = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .toLowerCase()
    .trim();

interface Connection {
  id: string;
  user_id: string;
  calendar_id: string | null;
  token_expires_at: string | null;
  access_token: string | null;
  refresh_token: string | null;
}

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

// Importa los eventos de UNA conexión de Google Calendar hacia la app:
// crea/agrupa pacientes por nombre normalizado y mapea color → tipo de sesión.
const importConnection = async (
  supabase: Supa,
  connection: Connection,
  googleClientId: string,
  googleClientSecret: string
): Promise<number> => {
  // Tokens descifrados vía RPC (con respaldo a texto plano durante la transición).
  const tokens = await getCalendarTokens(supabase, connection.id, connection);
  let accessToken: string | null = tokens.access_token;
  const refreshTokenStored: string | null = tokens.refresh_token;

  if (!accessToken || new Date(connection.token_expires_at || 0) <= new Date(Date.now() + 60_000)) {
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

  // Ventana de sincronización rutinaria: 2 meses atrás → 6 meses adelante.
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
      throw new Error('Error fetching Google Calendar');
    }
    if (Array.isArray(googleData.items)) events.push(...googleData.items);
    pageToken = googleData.nextPageToken;
  } while (pageToken);

  let syncedCount = 0;
  // IDs de eventos de Google vigentes en la ventana (para detectar borrados).
  const seenEventIds = new Set<string>();

  // Cargar todos los pacientes una vez (evita N+1) y mapear por clave normalizada.
  const { data: allPatients } = await supabase.from('patients').select('id, full_name, created_at');
  const patientsByKey = new Map<string, { id: string; created_at: string }>();
  for (const p of allPatients || []) {
    if (!p.full_name) continue;
    const key = normalizeKey(p.full_name);
    const existing = patientsByKey.get(key);
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

    seenEventIds.add(event.id as string);

    const displayName = cleanDisplayName(rawTitle);
    const phone = extractPhone(rawTitle);
    const nameKey = normalizeKey(displayName);
    const colorId = (event.colorId as string | undefined) || null;

    const { data: existingAppt } = await supabase
      .from('appointments')
      .select('id')
      .eq('google_event_id', event.id as string)
      .limit(1);

    if (existingAppt && existingAppt.length > 0) {
      // La cita YA existe: solo actualizar fecha/hora, color, tipo y metadatos.
      // NO tocamos patient_id: si el usuario unió pacientes manualmente, la cita
      // debe quedarse con su paciente. Tampoco resolvemos/creamos paciente aquí,
      // para no recrear fichas duplicadas que el usuario ya fusionó.
      // El trigger handle_appointment_autosync hace un PATCH de vuelta a Google
      // (no-op en tiempos) pero NO genera bucle: solo toca sync_status/google_*.
      await supabase
        .from('appointments')
        .update({
          title: displayName,
          starts_at: startsAt,
          ends_at: endsAt,
          google_html_link: event.htmlLink as string | undefined,
          sync_status: 'synced',
          color_id: colorId,
          session_type: resolveSessionType(colorId ?? undefined),
          updated_at: new Date().toISOString()
        })
        .eq('id', existingAppt[0].id);
      syncedCount++;
      continue;
    }

    // Cita nueva: recién aquí resolvemos o creamos el paciente por nombre.
    let patientId: string;
    const existingEntry = patientsByKey.get(nameKey);

    if (existingEntry) {
      patientId = existingEntry.id;
      if (phone) {
        await supabase.from('patients').update({ phone }).eq('id', patientId).is('phone', null);
      }
    } else {
      const { data: newPatient, error: pError } = await supabase
        .from('patients')
        .insert({ full_name: displayName, phone: phone ?? null, created_by: connection.user_id })
        .select('id, created_at')
        .single();

      if (pError) {
        console.error('Error creating patient', pError);
        continue;
      }
      patientId = newPatient.id;
      patientsByKey.set(nameKey, { id: newPatient.id, created_at: newPatient.created_at });
    }

    await supabase.from('appointments').insert({
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
      created_by: connection.user_id
    });
    syncedCount++;
  }

  // Borrado: si una cita que vino de Google ya no existe en Google (dentro de la
  // ventana), se elimina de la app — "como si no hubiera existido". Solo afecta
  // citas con google_event_id de ESTE calendario; las creadas localmente (sin
  // google_event_id) nunca se tocan. No hay datos clínicos colgando de la cita.
  const { data: appAppts } = await supabase
    .from('appointments')
    .select('id, google_event_id')
    .eq('google_calendar_id', connection.calendar_id || 'primary')
    .not('google_event_id', 'is', null)
    .gte('starts_at', timeMin.toISOString())
    .lt('starts_at', timeMax.toISOString());

  const toDelete = (appAppts || [])
    .filter(
      (a: { id: string; google_event_id: string | null }) =>
        a.google_event_id && !seenEventIds.has(a.google_event_id)
    )
    .map((a: { id: string }) => a.id);

  if (toDelete.length > 0) {
    await supabase.from('appointments').delete().in('id', toDelete);
  }

  return syncedCount;
};

const CONNECTION_COLUMNS =
  'id, user_id, calendar_id, token_expires_at, access_token, refresh_token';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: buildCorsHeaders(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'Metodo no permitido' });

  try {
    const supabaseUrl = requireEnv('SUPABASE_URL');
    const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    const googleClientId = requireEnv('GOOGLE_CLIENT_ID');
    const googleClientSecret = requireEnv('GOOGLE_CLIENT_SECRET');
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // --- Autenticación: secret del cron (server-side) o JWT del usuario (app) ---
    const syncSecret = req.headers.get('x-sync-secret');
    let connections: Connection[] = [];

    if (syncSecret) {
      const { data: cfg } = await supabase
        .from('integration_config')
        .select('value')
        .eq('key', 'gcal_autosync_secret')
        .single();
      if (!cfg || cfg.value !== syncSecret) {
        return json(req, 401, { error: 'Secret invalido' });
      }
      // Modo automático: procesar todas las conexiones de Google.
      const { data } = await supabase
        .from('calendar_connections')
        .select(CONNECTION_COLUMNS)
        .eq('provider', 'google');
      connections = (data as Connection[]) || [];
    } else {
      const token = getBearerToken(req);
      if (!token) return json(req, 401, { error: 'Falta autorizacion' });
      const { data: userData, error: userError } = await supabase.auth.getUser(token);
      if (userError || !userData.user) return json(req, 401, { error: 'Sesion invalida' });

      const { data: connection, error: connectionError } = await supabase
        .from('calendar_connections')
        .select(CONNECTION_COLUMNS)
        .eq('user_id', userData.user.id)
        .eq('provider', 'google')
        .single();

      if (connectionError || !connection) {
        return json(req, 400, { error: 'Google Calendar no conectado' });
      }
      connections = [connection as Connection];
    }

    let total = 0;
    for (const connection of connections) {
      try {
        total += await importConnection(supabase, connection, googleClientId, googleClientSecret);
      } catch (err) {
        console.error('import-connection-error', connection.id, err);
      }
    }

    return json(req, 200, { success: true, count: total });
  } catch (error) {
    console.error('google-calendar-fetch-error', error);
    return json(req, 500, { error: 'Internal Server Error' });
  }
});
