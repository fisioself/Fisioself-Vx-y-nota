import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportError } from '../lib/sentry';

// Shared chunk-load detector so both boundaries reload on stale CDN assets.
function isChunkLoadError(error: Error): boolean {
  const msg = error?.message ?? '';
  return /Failed to fetch dynamically imported module|Importing a module script failed|Unable to preload CSS|error loading dynamically imported module/i.test(
    msg
  );
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Chunk loading errors happen after a new Vercel deploy: the old JS filename
    // no longer exists on the CDN. Forcing a reload fetches the new bundle.
    if (isChunkLoadError(error)) {
      window.location.reload();
      return;
    }
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

// Lightweight boundary for individual panels: shows an inline error card instead
// of replacing the whole screen, so a crash in FinanzasPanel or ClinicDashboard
// leaves the rest of the app (navigation, patient list) intact.
interface PanelErrorBoundaryProps {
  children: ReactNode;
  label?: string;
}

interface PanelErrorBoundaryState {
  error: Error | null;
}

export class PanelErrorBoundary extends Component<
  PanelErrorBoundaryProps,
  PanelErrorBoundaryState
> {
  state: PanelErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): PanelErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (isChunkLoadError(error)) {
      window.location.reload();
      return;
    }
    if (import.meta.env.DEV) {
      console.error('Panel error', error, info);
    }
    reportError(error, { componentStack: info?.componentStack });
  }

  render() {
    if (this.state.error) {
      const where = this.props.label ? `en ${this.props.label}` : 'en este panel';
      return (
        <section className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <p className="error" role="alert" style={{ marginBottom: '0.75rem' }}>
            Error {where}. Tus datos están seguros en Supabase.
          </p>
          <div className="actions" style={{ justifyContent: 'center' }}>
            <button type="button" onClick={() => this.setState({ error: null })}>
              Reintentar
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => window.location.reload()}
            >
              Recargar app
            </button>
          </div>
        </section>
      );
    }
    return this.props.children;
  }
}
