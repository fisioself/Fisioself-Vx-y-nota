import { useState } from 'react';
import type { TimelineEntry } from '../../types/clinical';
import './ClinicalTimeline.css';

const fmtDate = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

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
                {item.date ? fmtDate(item.date) : 'Sin fecha'}
              </p>
              <p>{item.description}</p>
            </div>
          </article>
        ))}
        {!items.length && (
          <div style={{ textAlign: 'center', padding: '28px 0', opacity: 0.5 }}>
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
              <rect x="9" y="3" width="6" height="4" rx="1"/>
              <line x1="9" y1="12" x2="15" y2="12"/>
              <line x1="9" y1="16" x2="13" y2="16"/>
            </svg>
            <p className="muted" style={{ margin: '8px 0 0' }}>Aún no hay actividad clínica registrada.</p>
          </div>
        )}
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
