import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { AppRoot } from './app/AppRoot';
import { ErrorBoundary } from './app/ErrorBoundary';
import { registerServiceWorker } from './app/registerServiceWorker.js';
import { ToastProvider } from './app/ToastProvider';
import { initSentry } from './lib/sentry.js';
import { createIDBPersister } from './lib/offlineSync.js';
import './styles.css';
import './app/toasts.css';

initSentry();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24 // 24 hours
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
