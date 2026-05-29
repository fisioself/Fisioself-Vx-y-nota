import { reportError } from '../lib/sentry.js';

export const registerServiceWorker = () => {
  if (!('serviceWorker' in navigator)) return;

  if (import.meta.env.DEV) {
    // En desarrollo, destruimos agresivamente cualquier Service Worker
    // para evitar que oculte los cambios de código.
    navigator.serviceWorker.getRegistrations().then(function (registrations) {
      for (const registration of registrations) {
        registration.unregister();
        console.warn('[SW] Service Worker desinstalado (Modo Dev)');
      }
    });
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.info('[SW] Registrado con exito:', registration.scope);
      })
      .catch((err) => {
        console.warn('[SW] Registro fallido:', err.message);
        reportError(err, { context: 'service_worker_registration' });
      });
  });
};
