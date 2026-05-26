import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { useToast } from '../app/ToastProvider.jsx';

export function usePushNotifications() {
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const { notify } = useToast();

  const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY; // Requires setting up in .env

  useEffect(() => {
    async function checkSubscription() {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setLoading(false);
        return;
      }

      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        setSubscribed(!!subscription);
      } catch (error) {
        console.error('Error checking push subscription:', error);
      } finally {
        setLoading(false);
      }
    }
    checkSubscription();
  }, []);

  const subscribe = async () => {
    if (!VAPID_PUBLIC_KEY) {
      notify({ tone: 'error', message: 'VAPID public key no configurada' });
      return;
    }

    try {
      setLoading(true);
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        notify({ tone: 'warning', message: 'Permiso denegado para notificaciones' });
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: VAPID_PUBLIC_KEY
      });

      const subJSON = subscription.toJSON();
      
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;

      if (!userId) throw new Error('Usuario no autenticado');

      const { error } = await supabase
        .from('push_subscriptions')
        .upsert({
          user_id: userId,
          endpoint: subJSON.endpoint,
          p256dh: subJSON.keys.p256dh,
          auth: subJSON.keys.auth
        }, { onConflict: 'user_id, endpoint' });

      if (error) throw error;

      setSubscribed(true);
      notify({ tone: 'success', message: 'Notificaciones activadas' });
    } catch (error) {
      notify({ tone: 'error', message: 'Error activando notificaciones' });
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return { subscribed, loading, subscribe };
}
