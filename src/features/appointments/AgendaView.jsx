export function AgendaView() {
  return (
    <section className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="form-header">
        <div>
          <p className="eyebrow">Mi Agenda</p>
          <h2>Google Calendar</h2>
        </div>
        <a 
          href="https://calendar.google.com/calendar/u/0/r/week" 
          target="_blank" 
          rel="noopener noreferrer" 
          className="button secondary"
          style={{ textDecoration: 'none', padding: '0.5rem 1rem', borderRadius: '4px', border: '1px solid var(--border)', color: 'var(--text)' }}
        >
          Abrir en ventana nueva
        </a>
      </div>
      <p className="muted" style={{ marginBottom: '1rem' }}>
        Agenda tus citas directamente aquí. (Si el calendario no carga, verifica tener iniciada tu sesión de Google en el navegador).
      </p>
      <div style={{ flex: 1, minHeight: '600px', background: '#fff', borderRadius: '8px', overflow: 'hidden' }}>
        <iframe 
          src="https://calendar.google.com/calendar/embed?src=primary&mode=WEEK&showTitle=0&showPrint=0" 
          style={{ border: 0, width: '100%', height: '100%' }} 
          frameBorder="0" 
          scrolling="no"
          title="Google Calendar"
        ></iframe>
      </div>
    </section>
  );
}
