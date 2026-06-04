import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { AppRoot } from './app/AppRoot';
import { ErrorBoundary } from './app/ErrorBoundary';
import { registerServiceWorker } from './app/registerServiceWorker';
import { ToastProvider } from './app/ToastProvider';
import { initSentry } from './lib/sentry';
import { createIDBPersister } from './lib/offlineSync';
import './styles.css';
import './app/toasts.css';

initSentry();

// No tiene sentido reintentar errores "permanentes": si la BD dice 403/404 o RLS
// niega el acceso, reintentar solo retrasa el mensaje. Reintentamos únicamente
// fallos transitorios (red caída, timeouts, 5xx) que en un consultorio con wifi
// inestable suelen resolverse al segundo intento.
const isPermanentError = (err: unknown): boolean => {
  const status = (err as { status?: number; statusCode?: number })?.status;
  const code = (err as { code?: string })?.code ?? '';
  const msg = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase();
  if (typeof status === 'number' && status >= 400 && status < 500) return true;
  // Códigos de PostgREST/Supabase para "no encontrado" o "permiso denegado".
  if (code === 'PGRST301' || code === '42501' || code === 'PGRST116') return true;
  if (msg.includes('not found') || msg.includes('permission denied')) return true;
  return false;
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24, // 24 hours
      staleTime: 1000 * 60 * 5, // 5 minutos de caché instantáneo (Offline Speed - Punto 3)
      // Hasta 3 reintentos para errores transitorios; nunca para errores 4xx.
      retry: (failureCount, error) => !isPermanentError(error) && failureCount < 3,
      // Backoff exponencial con techo de 10s (1s, 2s, 4s, 8s…).
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
      refetchOnWindowFocus: true
    }
  }
});
const persister = createIDBPersister();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found in document.');

createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
        <ToastProvider>
          <AppRoot />
        </ToastProvider>
      </PersistQueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

registerServiceWorker();
