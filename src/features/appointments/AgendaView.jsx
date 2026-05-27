import { useCallback, useEffect, useRef, useState } from 'react';
import { calendarService } from '../../services/calendarService.js';
import { usePushNotifications } from '../../shared/usePushNotifications.js';
import { NativeCalendar } from '../../components/calendar/NativeCalendar';

export function AgendaView({ onPatientSelect }) {
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
    <section className="record-stack">
      <div className="card">
        <div className="form-header" style={{ marginBottom: 16 }}>
          <div>
            <p className="eyebrow">Mi Agenda</p>
            <h2>Calendario Integrado</h2>
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
              {status.connected ? 'Conectado a Google' : 'Sin conectar'}
            </span>
          )}
        </div>

        {status.loading ? (
          <p className="muted">Comprobando conexión…</p>
        ) : status.connected ? (
          <div style={{ marginTop: '1rem' }}>
            <NativeCalendar onEventClick={onPatientSelect} />
          </div>
        ) : (
          <div>
            <p className="muted" style={{ marginBottom: '1rem' }}>
              Conecta tu cuenta de Google y tus citas se sincronizarán automáticamente con tu calendario.
            </p>
            <button type="button" onClick={handleConnect} disabled={busy}>
              {busy ? 'Conectando…' : 'Conectar Google Calendar'}
            </button>
            {busy && (
              <p className="muted" style={{ marginTop: 10 }}>
                Se abrió una pestaña de Google. Autoriza el acceso y vuelve aquí.
              </p>
            )}
          </div>
        )}

        {error && (
          <p className="error" style={{ marginTop: 10 }}>
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
