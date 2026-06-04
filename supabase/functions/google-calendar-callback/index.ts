import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { setCalendarTokens } from '../_shared/calendarTokens.ts';

const html = (status: number, body: string) =>
  new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html;charset=utf-8' }
  });
const GENERIC_CALLBACK_ERROR = 'No se pudo completar la conexion con Google Calendar.';

const requireEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} no configurado`);
  return value;
};

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const page = (title: string, message: string) => `<!doctype html>
<html lang="es">
  <head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
  <body style="font-family:system-ui;padding:32px;line-height:1.5;color:#12372a;background:#f7f3ea">
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    <p>Ya puedes cerrar esta ventana y volver a FISIOSELF App Notas VX.</p>
  </body>
</html>`;

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const errorParam = url.searchParams.get('error');

    if (errorParam) return html(400, page('Conexion cancelada', `Google respondio: ${errorParam}`));
    if (!code || !state) return html(400, page('Faltan datos', 'No se recibio codigo o state.'));

    const supabaseUrl = requireEnv('SUPABASE_URL');
    const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    const googleClientId = requireEnv('GOOGLE_CLIENT_ID');
    const googleClientSecret = requireEnv('GOOGLE_CLIENT_SECRET');
    const redirectUri = requireEnv('GOOGLE_REDIRECT_URI');

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: stateRow, error: stateError } = await supabase
      .from('google_oauth_states')
      .select('*')
      .eq('state', state)
      .single();

    if (stateError || !stateRow)
      return html(
        400,
        page('State invalido', 'La solicitud no coincide con una conexion iniciada.')
      );
    if (stateRow.consumed_at)
      return html(400, page('State usado', 'Esta autorizacion ya fue utilizada.'));
    if (new Date(stateRow.expires_at) <= new Date())
      return html(400, page('State expirado', 'Vuelve a iniciar la conexion.'));

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: googleClientId,
        client_secret: googleClientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
      })
    });

    const tokenData = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok) {
      console.error('google_calendar_callback_token_failed', {
        status: tokenResponse.status,
        code: tokenData.error || 'unknown'
      });
      return html(400, page('Error OAuth', GENERIC_CALLBACK_ERROR));
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = Number(tokenData.expires_in || 3600);
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const profile = await profileResponse.json().catch(() => ({}));

    // Upsert SIN tokens en claro: solo metadatos y expiración. Los tokens
    // (secretos) se guardan cifrados justo después vía calendar_tokens_set.
    const { data: upserted, error: upsertError } = await supabase
      .from('calendar_connections')
      .upsert(
        {
          user_id: stateRow.user_id,
          provider: 'google',
          provider_account_email: profile.email || null,
          calendar_id: 'primary',
          token_expires_at: tokenExpiresAt,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'user_id,provider,calendar_id' }
      )
      .select('id')
      .single();

    if (upsertError || !upserted) throw upsertError || new Error('Upsert sin id');

    // Cifra y guarda los tokens vía Vault (o texto plano si el RPC aún no
    // existe). Se hace por id de conexión, ya conocido tras el upsert.
    await setCalendarTokens(supabase, upserted.id, accessToken, refreshToken || null);

    await supabase
      .from('google_oauth_states')
      .update({ consumed_at: new Date().toISOString() })
      .eq('state', state);

    return html(
      200,
      page('Google Calendar conectado', `Cuenta conectada: ${profile.email || 'Google Calendar'}.`)
    );
  } catch (error) {
    console.error('google_calendar_callback_failed', {
      name: error instanceof Error ? error.name : 'UnknownError'
    });
    return html(500, page('Error interno', GENERIC_CALLBACK_ERROR));
  }
});
