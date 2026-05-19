const formatDateTime = (value) => {
  if (!value) return 'Sin fecha';
  return new Date(value).toLocaleString('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
};

const statusLabel = {
  scheduled: 'Programada',
  completed: 'Completada',
  cancelled: 'Cancelada',
  no_show: 'No asistio'
};

const syncLabel = {
  pending: 'Pendiente Google',
  synced: 'Sincronizada',
  failed: 'Error Google',
  disabled: 'Sin Google'
};

export function AppointmentsList({ appointments = [] }) {
  const sorted = [...appointments].sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at));

  return (
    <section className="card">
      <div className="form-header">
        <div>
          <p className="eyebrow">Agenda</p>
          <h2>Citas del paciente</h2>
        </div>
        <span className="pill">{sorted.length}</span>
      </div>

      <div className="list-stack">
        {sorted.map((appointment) => (
          <article key={appointment.id} className="note-row">
            <div className="form-header">
              <div>
                <strong>{appointment.title}</strong>
                <p className="muted">{formatDateTime(appointment.starts_at)} - {formatDateTime(appointment.ends_at)}</p>
              </div>
              <span className="timeline-type">{statusLabel[appointment.status] || appointment.status}</span>
            </div>
            {appointment.location && <p>{appointment.location}</p>}
            {appointment.description && <p className="muted">{appointment.description}</p>}
            <p className="muted">Google Calendar: {syncLabel[appointment.sync_status] || appointment.sync_status}</p>
            {appointment.google_html_link && (
              <a href={appointment.google_html_link} target="_blank" rel="noreferrer">Abrir en Google Calendar</a>
            )}
            {appointment.sync_error && <p className="error">{appointment.sync_error}</p>}
          </article>
        ))}
        {!sorted.length && <p className="muted">Aun no hay citas registradas para este paciente.</p>}
      </div>
    </section>
  );
}
