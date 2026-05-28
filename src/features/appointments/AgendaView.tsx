import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { calendarService, type GoogleCalendarEvent } from '../../services/calendarService';
import { usePushNotifications } from '../../shared/usePushNotifications';
import { getErrorMessage } from '../../shared/errors';

interface CalendarStatus {
  loading: boolean;
  connected: boolean;
  email: string | null;
}

const linkButton: CSSProperties = {
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
  const [status, setStatus] = useState<CalendarStatus>({
    loading: true,
    connected: false,
    email: null
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [events, setEvents] = useState<GoogleCalendarEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { subscribed, subscribe, loading: pushLoading } = usePushNotifications();

  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    try {
      const result = await calendarService.fetchEvents({ maxResults: 10 });
      setEvents(result);
    } catch {
      setEvents([]);
    } finally {
      setEventsLoading(false);
    }
  }, []);

  const refreshStatus = useCallback(async (): Promise<boolean> => {
    try {
      const result = await calendarService.getConnectionStatus();
      setStatus({ loading: false, connected: result.connected, email: result.email });
      if (result.connected) loadEvents();
      return result.connected;
    } catch {
      setStatus({ loading: false, connected: false, email: null });
      return false;
    }
  }, [loadEvents]);

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
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setBusy(false);
        }
      }, 2500);
    } catch (err) {
      setError(getErrorMessage(err, 'Error al conectar Google Calendar.'));
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

          {eventsLoading ? (
            <p className="muted">Cargando eventos…</p>
          ) : events.length > 0 ? (
            <div className="list-stack" style={{ marginTop: 12 }}>
              {events.map((ev) => (
                <article key={ev.id} className="note-row">
                  <div className="form-header">
                    <strong>{ev.summary || 'Sin título'}</strong>
                    {ev.html_link && (
                      <a href={ev.html_link} target="_blank" rel="noopener noreferrer">
                        Ver en Calendar
                      </a>
                    )}
                  </div>
                  <p className="muted">
                    {new Date(ev.starts_at).toLocaleString()}
                    {ev.ends_at && ` — ${new Date(ev.ends_at).toLocaleTimeString()}`}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted" style={{ marginTop: 12 }}>
              No hay eventos próximos en tu Google Calendar.
            </p>
          )}

          <div
            className="actions"
            style={{ justifyContent: 'flex-start', gap: 10, flexWrap: 'wrap', marginTop: 12 }}
          >
            <a
              href="https://calendar.google.com"
              target="_blank"
              rel="noopener noreferrer"
              style={linkButton}
            >
              Abrir Google Calendar
            </a>
            <button type="button" className="secondary" onClick={loadEvents} disabled={eventsLoading}>
              Actualizar
            </button>
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
