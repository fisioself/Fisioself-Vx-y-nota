import { calendarService } from '../../services/calendarService';
import { getErrorMessage } from '../../shared/errors';

export function CalendarConfig() {
  const handleConnect = async () => {
    try {
      await calendarService.startGoogleConnection();
    } catch (err) {
      alert(getErrorMessage(err, 'Error al conectar Google Calendar.'));
    }
  };

  return (
    <section className="card">
      <div className="form-header">
        <div>
          <p className="eyebrow">Integraciones</p>
          <h2>Google Calendar</h2>
        </div>
      </div>
      <p>Conecta tu cuenta para sincronizar tus citas automáticamente.</p>
      <button type="button" onClick={handleConnect}>
        Conectar Google Calendar
      </button>
    </section>
  );
}
