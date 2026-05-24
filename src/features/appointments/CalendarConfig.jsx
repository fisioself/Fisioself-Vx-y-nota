import { useState } from 'react';
import { calendarService } from '../../services/calendarService.js';

export function CalendarConfig() {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  const handleConnect = async () => {
    setConnecting(true);
    setError('');
    try {
      await calendarService.startGoogleConnection();
    } catch (err) {
      setError(err.message || 'Error al conectar Google Calendar.');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <section className="card calendar-config">
      <div className="form-header">
        <div>
          <p className="eyebrow">Integraciones</p>
          <h2>Google Calendar</h2>
        </div>
      </div>
      <p className="muted">
        Conecta tu cuenta de Google para sincronizar las citas de este paciente con tu calendario.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="button" onClick={handleConnect} disabled={connecting}>
        {connecting ? 'Abriendo Google...' : 'Conectar Google Calendar'}
      </button>
    </section>
  );
}
