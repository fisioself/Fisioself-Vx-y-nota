import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { AppRoot } from './app/AppRoot.jsx';
import { ErrorBoundary } from './app/ErrorBoundary.jsx';
import { registerServiceWorker } from './app/registerServiceWorker.js';
import { ToastProvider } from './app/ToastProvider.jsx';
import { initSentry } from './lib/sentry.js';
import { createIDBPersister } from './lib/offlineSync.js';
import './styles.css';
import './app/toasts.css';

initSentry();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24, // 24 hours
      staleTime: 1000 * 60 * 5, // 5 minutos de caché instantáneo (Offline Speed - Punto 3)
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});
const persister = createIDBPersister();

createRoot(document.getElementById('root')).render(
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

