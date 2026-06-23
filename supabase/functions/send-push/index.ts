import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { buildCorsHeaders, jsonResponse } from '../_shared/cors.ts';

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:fisioselff@gmail.com';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  user_ids?: string[];
}

interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: buildCorsHeaders(req) });
  }

  if (req.method !== 'POST') {
    return jsonResponse(req, 405, { error: 'Method not allowed' });
  }

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return jsonResponse(req, 503, { error: 'VAPID keys not configured' });
  }

  // Accept either x-push-secret (DB triggers / cron) or Authorization JWT (direct calls)
  const pushSecretHeader = req.headers.get('x-push-secret');
  const authHeader = req.headers.get('Authorization');

  if (!pushSecretHeader && !authHeader) {
    return jsonResponse(req, 401, { error: 'Missing authentication' });
  }

  // Cliente con privilegios de servicio (omite RLS). Se usa para verificar el
  // secreto del cron y para limpiar suscripciones caducadas.
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Cliente con el que se LEEN las suscripciones a notificar. Por defecto, el
  // service role: la rama x-push-secret (cron / triggers) debe poder notificar a
  // cualquier terapeuta de forma autónoma.
  let subscriptionsClient = serviceClient;

  if (pushSecretHeader) {
    // Verify x-push-secret against integration_config (same pattern as gcal_autosync_secret)
    const { data: configRow } = await serviceClient
      .from('integration_config')
      .select('value')
      .eq('key', 'push_reminder_secret')
      .single();

    if (!configRow || configRow.value !== pushSecretHeader) {
      return jsonResponse(req, 401, { error: 'Invalid push secret' });
    }
  } else {
    // Rama de llamada directa con JWT. Se instancia un cliente con el token del
    // propio usuario: el RLS de push_subscriptions (auth.uid() = user_id)
    // restringe inherentemente la lectura a SUS PROPIAS suscripciones. Así, un
    // user_ids manipulado con UUIDs ajenos devuelve cero filas y no puede
    // notificar a usuarios de otras clínicas.
    const token = authHeader!.replace(/^Bearer\s+/i, '');
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return jsonResponse(req, 401, { error: 'Invalid session' });
    }
    const { data: profile } = await userClient
      .from('profiles')
      .select('role, active')
      .eq('id', userData.user.id)
      .single();
    if (!profile?.active || !['admin', 'therapist'].includes(profile.role)) {
      return jsonResponse(req, 403, { error: 'Not authorized to send push' });
    }

    subscriptionsClient = userClient;
  }

  let payload: PushPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(req, 400, { error: 'Invalid JSON body' });
  }

  if (!payload.title || !payload.body) {
    return jsonResponse(req, 400, { error: 'title and body are required' });
  }

  // Fetch subscriptions — optionally filtered by user_ids. Con el cliente JWT el
  // RLS ya acota el resultado a las suscripciones del propio usuario.
  let query = subscriptionsClient
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth');
  if (payload.user_ids && payload.user_ids.length > 0) {
    query = query.in('user_id', payload.user_ids);
  }

  const { data: subscriptions, error: dbError } = await query;
  if (dbError) {
    // No exponemos el mensaje crudo de la BD al cliente; se registra en el log.
    console.error('send_push_db_error', dbError.message);
    return jsonResponse(req, 500, { error: 'DB error reading subscriptions' });
  }

  if (!subscriptions || subscriptions.length === 0) {
    return jsonResponse(req, 200, { sent: 0, message: 'No subscriptions found' });
  }

  const notification = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? '/'
  });

  const expiredIds: string[] = [];
  let sent = 0;
  let failed = 0;

  await Promise.allSettled(
    (subscriptions as PushSubscriptionRow[]).map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          notification
        );
        sent++;
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 410 || status === 404) {
          expiredIds.push(sub.id);
        } else {
          console.error('[send-push] Failed for endpoint', sub.endpoint, err);
          failed++;
        }
      }
    })
  );

  if (expiredIds.length > 0) {
    // La limpieza de endpoints muertos usa el service role (el cliente JWT solo
    // podría borrar los del propio usuario por RLS).
    await serviceClient.from('push_subscriptions').delete().in('id', expiredIds);
  }

  return jsonResponse(req, 200, {
    sent,
    failed,
    expired_removed: expiredIds.length
  });
});
