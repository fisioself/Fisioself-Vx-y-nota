import './ClinicalTimeline.css';

const typeLabels = {
  evaluation: 'Valoracion',
  session_note: 'Nota',
  ai_consult: 'IA',
  follow_up: 'Seguimiento'
};

export function ClinicalTimeline({ items = [] }) {
  return (
    <section className="card">
      <div className="form-header">
        <div>
          <p className="eyebrow">Linea de tiempo</p>
          <h2>Actividad clinica</h2>
        </div>
        <span className="pill">{items.length}</span>
      </div>

      <div className="timeline">
        {items.map((item) => (
          <article key={`${item.type}-${item.id}`} className="timeline-item">
            <div className="timeline-dot" aria-hidden="true" />
            <div>
              <div className="form-header">
                <strong>{item.label}</strong>
                <span className="timeline-type">{typeLabels[item.type] || item.type}</span>
              </div>
              <p className="muted">
                {item.date ? new Date(item.date).toLocaleDateString('es-MX') : 'Sin fecha'}
              </p>
              <p>{item.description}</p>
            </div>
          </article>
        ))}
        {!items.length && <p className="muted">Aun no hay actividad clinica para mostrar.</p>}
      </div>
    </section>
  );
}
