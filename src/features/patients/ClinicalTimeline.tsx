import { useMemo, useState } from 'react';
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
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  // Group items that share the same calendar date into a single row
  const groups = useMemo(() => {
    const map = new Map<
      string,
      { dateKey: string; displayDate: string; entries: TimelineEntry[] }
    >();
    for (const item of items) {
      const key = item.date ? item.date.slice(0, 10) : 'sin-fecha';
      if (!map.has(key)) {
        map.set(key, { dateKey: key, displayDate: item.date || '', entries: [] });
      }
      map.get(key)!.entries.push(item);
    }
    return Array.from(map.values());
  }, [items]);

  const visibleGroups = expanded ? groups : groups.slice(0, 2);
  const hasMore = groups.length > 2;

  const toggleDesc = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
        {visibleGroups.map((group) => (
          <article key={group.dateKey} className="timeline-item">
            <div className="timeline-dot" aria-hidden="true" />
            <div style={{ flex: 1 }}>
              <p className="muted" style={{ marginBottom: 6, fontSize: '0.82rem' }}>
                {group.displayDate ? fmtDate(group.displayDate) : 'Sin fecha'}
              </p>
              {group.entries.map((item) => {
                const entryId = `${item.type}-${item.id}`;
                const isOpen = openIds.has(entryId);
                return (
                  <div key={entryId} style={{ marginBottom: 8 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap'
                      }}
                    >
                      <strong style={{ fontSize: '0.9rem' }}>{item.label}</strong>
                      <span className="timeline-type">{typeLabels[item.type] || item.type}</span>
                      {item.description && (
                        <button
                          type="button"
                          className="secondary btn-sm"
                          onClick={() => toggleDesc(entryId)}
                        >
                          {isOpen ? 'Ocultar' : 'Ver más'}
                        </button>
                      )}
                    </div>
                    {isOpen && (
                      <p style={{ marginTop: 4, fontSize: '0.85rem' }}>{item.description}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </article>
        ))}
        {!items.length && (
          <div style={{ textAlign: 'center', padding: '28px 0', opacity: 0.5 }}>
            <svg
              width="52"
              height="52"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
              <rect x="9" y="3" width="6" height="4" rx="1" />
              <line x1="9" y1="12" x2="15" y2="12" />
              <line x1="9" y1="16" x2="13" y2="16" />
            </svg>
            <p className="muted" style={{ margin: '8px 0 0' }}>
              Aún no hay actividad clínica registrada.
            </p>
          </div>
        )}
      </div>

      {!expanded && hasMore && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button type="button" className="secondary" onClick={() => setExpanded(true)}>
            Ver historial completo ({items.length} eventos)
          </button>
        </div>
      )}
      {expanded && hasMore && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button type="button" className="secondary" onClick={() => setExpanded(false)}>
            Ocultar historial
          </button>
        </div>
      )}
    </section>
  );
}
