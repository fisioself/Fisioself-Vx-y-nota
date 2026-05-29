import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { buildCorsHeaders, jsonResponse } from '../_shared/cors.ts';

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:fisioselff@gmail.com';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

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

  // Require service_role or authenticated user
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse(req, 401, { error: 'Missing Authorization header' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let payload: PushPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(req, 400, { error: 'Invalid JSON body' });
  }

  if (!payload.title || !payload.body) {
    return jsonResponse(req, 400, { error: 'title and body are required' });
  }

  // Fetch subscriptions — optionally filtered by user_ids
  let query = supabase.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth');
  if (payload.user_ids && payload.user_ids.length > 0) {
    query = query.in('user_id', payload.user_ids);
  }

  const { data: subscriptions, error: dbError } = await query;
  if (dbError) {
    return jsonResponse(req, 500, {
      error: 'DB error reading subscriptions',
      detail: dbError.message
    });
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
          // Subscription expired or unregistered — clean up
          expiredIds.push(sub.id);
        } else {
          console.error('[send-push] Failed for endpoint', sub.endpoint, err);
          failed++;
        }
      }
    })
  );

  // Remove expired subscriptions
  if (expiredIds.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', expiredIds);
  }

  return jsonResponse(req, 200, {
    sent,
    failed,
    expired_removed: expiredIds.length
  });
});
