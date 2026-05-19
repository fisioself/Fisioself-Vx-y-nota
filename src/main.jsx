import React from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from './app/ErrorBoundary.jsx';
import { registerServiceWorker } from './app/registerServiceWorker.js';
import { ToastProvider } from './app/ToastProvider.jsx';
import { App } from './App.jsx';
import './styles.css';
import './app/toasts.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

registerServiceWorker();
