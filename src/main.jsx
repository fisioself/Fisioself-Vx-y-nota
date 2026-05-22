import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppRoot } from './app/AppRoot.jsx';
import { ErrorBoundary } from './app/ErrorBoundary.jsx';
import { registerServiceWorker } from './app/registerServiceWorker.js';
import { ToastProvider } from './app/ToastProvider.jsx';
import { initSentry } from './lib/sentry.js';
import './styles.css';
import './app/toasts.css';

initSentry();

const queryClient = new QueryClient();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AppRoot />
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

registerServiceWorker();

