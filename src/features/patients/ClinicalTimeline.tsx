import { useState } from 'react';
import type { TimelineEntry } from '../../types/clinical';
import './ClinicalTimeline.css';

const typeLabels: Record<TimelineEntry['type'], string> = {
  evaluation: 'Valoracion',
  session_note: 'Nota',
  ai_consult: 'IA',
  follow_up: 'Seguimiento',
  appointment: 'Cita'
};

interface ClinicalTimelineProps {
  items?: TimelineEntry[];
}

export function ClinicalTimeline({ items = [] }: ClinicalTimelineProps) {
  const [expanded, setExpanded] = useState(false);

  const visibleItems = expanded ? items : items.slice(0, 2);
  const hasMore = items.length > 2;

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
        {visibleItems.map((item) => (
          <article key={`${item.type}-${item.id}`} className="timeline-item">
            <div className="timeline-dot" aria-hidden="true" />
            <div>
              <div className="form-header">
                <strong>{item.label}</strong>
                <span className="timeline-type">{typeLabels[item.type] || item.type}</span>
              </div>
              <p className="muted">
                {item.date ? new Date(item.date).toLocaleDateString() : 'Sin fecha'}
              </p>
              <p>{item.description}</p>
            </div>
          </article>
        ))}
        {!items.length && <p className="muted">Aun no hay actividad clinica para mostrar.</p>}
      </div>

      {!expanded && hasMore && (
        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <button type="button" className="secondary" onClick={() => setExpanded(true)}>
            Ver historial completo ({items.length} eventos)
          </button>
        </div>
      )}
      {expanded && hasMore && (
        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <button type="button" className="secondary" onClick={() => setExpanded(false)}>
            Ocultar historial
          </button>
        </div>
      )}
    </section>
  );
}
