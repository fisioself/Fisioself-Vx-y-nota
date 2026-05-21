import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppRoot } from './app/AppRoot.jsx';
import { ErrorBoundary } from './app/ErrorBoundary.jsx';
import { registerServiceWorker } from './app/registerServiceWorker.js';
import { ToastProvider } from './app/ToastProvider.jsx';
import { initSentry } from './lib/sentry.js';
import './styles.css';
import './app/toasts.css';

initSentry();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <AppRoot />
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

registerServiceWorker();
