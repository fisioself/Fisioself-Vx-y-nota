import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jsonResponse, buildCorsHeaders } from '../_shared/cors.ts';

const json = (req: Request, status: number, body: unknown) => jsonResponse(req, status, body);

const requireEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} no configurado`);
  return value;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: buildCorsHeaders(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'Metodo no permitido' });

  try {
    const supabaseUrl = requireEnv('SUPABASE_URL');
    const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    const googleClientId = requireEnv('GOOGLE_CLIENT_ID');
    const redirectUri = requireEnv('GOOGLE_REDIRECT_URI');
    const authHeader = req.headers.get('authorization');

    if (!authHeader) return json(req, 401, { error: 'Falta autorizacion' });

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return json(req, 401, { error: 'Sesion invalida' });

    const state = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: stateError } = await supabase.from('google_oauth_states').insert({
      state,
      user_id: userData.user.id,
      expires_at: expiresAt
    });
    if (stateError) throw stateError;

    const params = new URLSearchParams({
      client_id: googleClientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      scope: 'https://www.googleapis.com/auth/calendar.events',
      state
    });

    return json(req, 200, {
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
    });
  } catch (error) {
    return json(req, 500, {
      error: error instanceof Error ? error.message : 'Error al iniciar Google Calendar'
    });
  }
});
