import { assertSupabase } from '../lib/supabaseClient';

// Clave pública VAPID: la misma cuyo par privado usa la edge function send-push
// para firmar los envíos. Si falta, las notificaciones no se pueden activar.
const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export const isPushConfigured = Boolean(vapidPublicKey);

// El navegador soporta Web Push solo si están las tres piezas. iOS solo lo
// expone cuando la app está instalada como PWA (añadida a la pantalla de inicio).
export const isPushSupported = (): boolean =>
  typeof window !== 'undefined' &&
  'Notification' in window &&
  'serviceWorker' in navigator &&
  'PushManager' in window;

// Convierte la clave VAPID (base64url) al Uint8Array que exige
// pushManager.subscribe({ applicationServerKey }).
const urlBase64ToUint8Array = (base64String: string): Uint8Array<ArrayBuffer> => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  // Respaldamos el array en un ArrayBuffer explícito para que el tipo sea
  // Uint8Array<ArrayBuffer> (BufferSource válido para applicationServerKey).
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
};

const getRegistration = (): Promise<ServiceWorkerRegistration> => navigator.serviceWorker.ready;

// p256dh y auth son las claves públicas de cifrado de la suscripción; el
// servidor las necesita para cifrar el payload de cada notificación.
const extractKeys = (sub: PushSubscription): { p256dh: string; auth: string } => {
  const keys = sub.toJSON().keys ?? {};
  return { p256dh: keys.p256dh ?? '', auth: keys.auth ?? '' };
};

export const pushService = {
  // ¿Este navegador ya tiene una suscripción activa y permiso concedido?
  async isEnabled(): Promise<boolean> {
    if (!isPushSupported()) return false;
    if (Notification.permission !== 'granted') return false;
    const reg = await getRegistration();
    const sub = await reg.pushManager.getSubscription();
    return Boolean(sub);
  },

  // Pide permiso, suscribe el navegador y guarda la suscripción del usuario.
  // El upsert por (user_id, endpoint) evita duplicados al reactivar.
  async enable(userId: string): Promise<void> {
    if (!isPushSupported()) throw new Error('Tu navegador no soporta notificaciones.');
    if (!vapidPublicKey)
      throw new Error('Las notificaciones no están configuradas (falta la clave VAPID).');

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error(
        'No diste permiso de notificaciones. Actívalo en los ajustes del navegador para recibir recordatorios.'
      );
    }

    const reg = await getRegistration();
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
      }));

    const { p256dh, auth } = extractKeys(sub);
    const supabase = assertSupabase();
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        { user_id: userId, endpoint: sub.endpoint, p256dh, auth },
        { onConflict: 'user_id,endpoint' }
      );
    if (error) throw new Error(error.message || 'No se pudo guardar la suscripción.');
  },

  // Borra la suscripción del servidor (RLS la limita a la del propio usuario) y
  // la cancela en el navegador.
  async disable(): Promise<void> {
    if (!isPushSupported()) return;
    const reg = await getRegistration();
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const supabase = assertSupabase();
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  }
};
