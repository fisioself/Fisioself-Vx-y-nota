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
    const timeMin = typeof body.time_min === 'string' ? body.time_min : new Date().toISOString();
    const maxResults = typeof body.max_results === 'number' ? Math.min(body.max_results, 50) : 20;

    const { data: connection, error: connectionError } = await supabase
      .from('calendar_connections')
      .select('id, calendar_id, token_expires_at')
      .eq('user_id', userData.user.id)
      .eq('provider', 'google')
      .single();

    if (connectionError || !connection) {
      return json(req, 400, { error: 'Google Calendar no conectado' });
    }

    const { data: tokensRows, error: tokensError } = await supabase.rpc('calendar_tokens_get', {
      p_connection_id: connection.id
    });
    if (tokensError) throw tokensError;
    const tokens = Array.isArray(tokensRows) ? tokensRows[0] : tokensRows;

    let accessToken: string | null = tokens?.access_token ?? null;
    const refreshTokenStored: string | null = tokens?.refresh_token ?? null;

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
      const { error: tokenWriteError } = await supabase.rpc('calendar_tokens_set', {
        p_connection_id: connection.id,
        p_access_token: accessToken,
        p_refresh_token: refreshTokenStored
      });
      if (tokenWriteError) throw tokenWriteError;
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

    const calendarId = encodeURIComponent(connection.calendar_id || 'primary');
    const params = new URLSearchParams({
      timeMin,
      maxResults: String(maxResults),
      singleEvents: 'true',
      orderBy: 'startTime'
    });

    const googleResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const googleData = await googleResponse.json().catch(() => ({}));
    if (!googleResponse.ok) {
      console.error('google_calendar_fetch_rejected', { status: googleResponse.status });
      return json(req, googleResponse.status, { error: 'No se pudieron obtener eventos de Google Calendar' });
    }

    // Return only safe fields — never forward attendee emails or full event descriptions
    const events = (googleData.items || []).map((item: Record<string, unknown>) => {
      const start = (item.start as Record<string, unknown> | undefined) ?? {};
      const end = (item.end as Record<string, unknown> | undefined) ?? {};
      return {
        id: item.id,
        summary: item.summary,
        starts_at: start.dateTime ?? start.date,
        ends_at: end.dateTime ?? end.date,
        html_link: item.htmlLink
      };
    });

    return json(req, 200, { events });
  } catch (error) {
    console.error('google_calendar_fetch_failed', {
      name: error instanceof Error ? error.name : 'UnknownError'
    });
    return json(req, 500, { error: 'No se pudieron obtener eventos de Google Calendar' });
  }
});
