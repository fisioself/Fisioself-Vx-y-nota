import { calendarService } from '../../services/calendarService.js';

export function AgendaView() {
  const handleConnect = async () => {
    try {
      await calendarService.startGoogleConnection();
    } catch (err) {
      alert(err.message || 'Error al conectar Google Calendar.');
    }
  };

  return (
    <section className="card">
      <div className="form-header">
        <div>
          <p className="eyebrow">Mi Agenda</p>
          <h2>Google Calendar Interactivo</h2>
        </div>
      </div>
      <p className="muted" style={{ marginBottom: '1rem' }}>
        Estamos configurando la sincronización bidireccional completa. Para gestionar tus citas directamente desde aquí, asegúrate de haber autorizado los permisos de edición en tu cuenta de Google.
      </p>
      <button type="button" className="secondary" onClick={handleConnect}>
        Gestionar conexión con Google Calendar
      </button>
    </section>
  );
}
