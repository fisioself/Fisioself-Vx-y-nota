import { useCallback, useEffect, useRef, useState } from 'react';
import { calendarService } from '../../services/calendarService.js';
import { usePushNotifications } from '../../shared/usePushNotifications.js';

const linkButton = {
  display: 'inline-flex',
  alignItems: 'center',
  background: '#12372a',
  color: 'white',
  padding: '12px 16px',
  borderRadius: 14,
  fontWeight: 800,
  textDecoration: 'none'
};

export function AgendaView() {
  const [status, setStatus] = useState({ loading: true, connected: false, email: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pollRef = useRef(null);

  const { subscribed, subscribe, loading: pushLoading } = usePushNotifications();

  const refreshStatus = useCallback(async () => {
    try {
      const result = await calendarService.getConnectionStatus();
      setStatus({ loading: false, connected: result.connected, email: result.email });
      return result.connected;
    } catch {
      setStatus({ loading: false, connected: false, email: null });
      return false;
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refreshStatus]);

  const handleConnect = useCallback(async () => {
    setError('');
    setBusy(true);
    try {
      await calendarService.startGoogleConnection();
      // Mientras el usuario autoriza en la otra pestaña, sondeamos el estado.
      let elapsed = 0;
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        elapsed += 2500;
        const connected = await refreshStatus();
        if (connected || elapsed > 120000) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setBusy(false);
        }
      }, 2500);
    } catch (err) {
      setError(err.message || 'Error al conectar Google Calendar.');
      setBusy(false);
    }
  }, [refreshStatus]);

  return (
    <section className="card">
      <div className="form-header">
        <div>
          <p className="eyebrow">Mi Agenda</p>
          <h2>Google Calendar</h2>
        </div>
        {!status.loading && (
          <span
            className="pill"
            style={{
              gap: 8,
              background: status.connected ? '#dcefe2' : '#f0e6cf',
              color: status.connected ? '#15613f' : '#7a5b12'
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 9,
                height: 9,
                borderRadius: 999,
                background: status.connected ? '#1f9d57' : '#c08a1e'
              }}
            />
            {status.connected ? 'Conectado' : 'Sin conectar'}
          </span>
        )}
      </div>

      {status.loading ? (
        <p className="muted">Comprobando conexión…</p>
      ) : status.connected ? (
        <>
          <div className="ai-box" style={{ display: 'grid', gap: 4 }}>
            <p style={{ margin: 0 }}>Tus citas se sincronizan automáticamente</p>
            <span className="muted" style={{ fontWeight: 600 }}>
              {status.email ? `Cuenta: ${status.email}` : 'Cuenta de Google vinculada'}
            </span>
          </div>
          <p className="muted" style={{ marginBottom: '1rem' }}>
            Cada cita que crees aparecerá en tu Google Calendar al instante. Si quieres usar otra
            cuenta, puedes reconectar.
          </p>
          <div
            className="actions"
            style={{ justifyContent: 'flex-start', gap: 10, flexWrap: 'wrap' }}
          >
            <a
              href="https://calendar.google.com"
              target="_blank"
              rel="noopener noreferrer"
              style={linkButton}
            >
              Abrir Google Calendar
            </a>
            <button type="button" className="secondary" onClick={handleConnect} disabled={busy}>
              {busy ? 'Reconectando…' : 'Reconectar'}
            </button>
            {!pushLoading && !subscribed && (
              <button type="button" className="secondary" onClick={subscribe}>
                Activar notificaciones de citas
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="muted" style={{ marginBottom: '1rem' }}>
            Conecta tu cuenta de Google y tus citas se sincronizarán automáticamente con tu
            calendario.
          </p>
          <button type="button" onClick={handleConnect} disabled={busy}>
            {busy ? 'Conectando…' : 'Conectar Google Calendar'}
          </button>
          {busy && (
            <p className="muted" style={{ marginTop: 10 }}>
              Se abrió una pestaña de Google. Autoriza el acceso y vuelve aquí.
            </p>
          )}
        </>
      )}

      {error && (
        <p className="error" style={{ marginTop: 10 }}>
          {error}
        </p>
      )}
    </section>
  );
}
