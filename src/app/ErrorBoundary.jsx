import React from 'react';
import { reportError } from '../lib/sentry.js';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (import.meta.env.DEV) {
      console.error('Unhandled UI error', error, info);
    }
    reportError(error, { componentStack: info?.componentStack });
  }

  render() {
    if (this.state.error) {
      return (
        <main className="auth-shell">
          <section className="card auth-card">
            <p className="eyebrow">FISIOSELF App Notas VX</p>
            <h1>Algo salio mal</h1>
            <p className="muted">
              La pantalla tuvo un error inesperado. Tus datos se conservan en Supabase.
            </p>
            <div className="actions">
              <button type="button" onClick={() => this.setState({ error: null })}>
                Reintentar
              </button>
              <button type="button" className="secondary" onClick={() => window.location.reload()}>
                Recargar
              </button>
            </div>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
