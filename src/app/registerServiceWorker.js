export const registerServiceWorker = () => {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { type: 'module' })
      .then((registration) => {
        console.log('[SW] Registrado con exito:', registration.scope);
      })
      .catch((err) => {
        console.warn('[SW] Registro fallido:', err.message);
        // Hallazgo #11: Logging to Sentry
        import('../lib/sentry.js')
          .then(({ captureException }) => {
            if (captureException) captureException(err);
          })
          .catch(() => {});
      });
  });
};
