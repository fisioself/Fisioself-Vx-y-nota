import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { seguimientosApi, type FollowUpRow } from '../../services/seguimientosApi';
import './SeguimientosView.css';

interface SeguimientosViewProps {
  onPatientSelect: (id: string) => void;
}

function buildWhatsAppUrl(
  phone: string,
  name: string | null,
  nextAppt: FollowUpRow['nextAppointment'],
  days: number | null
): string {
  const digits = phone.replace(/\D/g, '');
  const number = digits.length === 10 ? `52${digits}` : digits;
  const first = name?.split(' ')[0] ?? 'paciente';
  let msg: string;
  if (nextAppt) {
    const d = new Date(nextAppt.starts_at);
    const dateStr = d.toLocaleDateString('es-MX', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });
    const timeStr = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    msg = `Hola ${first} 😊 Te recordamos tu cita en Fisioself:\n📅 ${dateStr} a las ${timeStr}\n¡Te esperamos! Cualquier duda aquí estamos.`;
  } else {
    msg =
      days != null
        ? `Hola ${first} 😊 Han pasado ${days} días desde tu última sesión en Fisioself. ¿Cómo te has sentido? Estamos disponibles para agendar tu próxima cita cuando gustes. 💪`
        : `Hola ${first} 😊 Queremos saber cómo te has sentido. En Fisioself estamos disponibles para agendar tu próxima cita cuando gustes.`;
  }
  return `https://wa.me/${number}?text=${encodeURIComponent(msg)}`;
}

function fmtDays(days: number | null): { text: string; color: string } {
  if (days === null) return { text: 'Sin cita previa', color: 'var(--muted)' };
  if (days === 0) return { text: 'Última cita hoy', color: 'var(--income)' };
  if (days === 1) return { text: 'Última cita ayer', color: 'var(--income)' };
  if (days < 14) return { text: `Hace ${days} días`, color: 'var(--text-main)' };
  if (days <= 30) return { text: `Hace ${days} días`, color: '#d97706' };
  return { text: `Hace ${days} días`, color: 'var(--danger)' };
}

function fmtTime(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

function fmtNextAppt(appt: FollowUpRow['nextAppointment']): string {
  if (!appt) return '';
  const d = new Date(appt.starts_at);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const apptDay = new Date(d);
  apptDay.setHours(0, 0, 0, 0);
  const time = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  if (apptDay.getTime() === today.getTime()) return `Hoy ${time}`;
  if (apptDay.getTime() === tomorrow.getTime()) return `Mañana ${time}`;
  return (
    d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }) +
    ` ${time}`
  );
}

const WA_ICON = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

type FilterKey = 'all' | 'ok' | 'warning' | 'critical';

function PatientRow({
  row,
  onPatientSelect
}: {
  row: FollowUpRow;
  onPatientSelect: (id: string) => void;
}) {
  const days = fmtDays(row.daysSinceContact);
  const nextApptStr = fmtNextAppt(row.nextAppointment);

  return (
    <div className="sg-row">
      <span className={`sg-dot ${row.alertLevel}`} aria-hidden="true" />

      <div className="sg-info">
        <div className="sg-name">
          {row.full_name ?? '—'}
          {row.status && (
            <span className="pill" style={{ marginLeft: 8, fontSize: '0.75rem' }}>
              {row.status}
            </span>
          )}
        </div>
        {row.medical_diagnosis && (
          <div className="sg-diag">{row.medical_diagnosis}</div>
        )}
        <div className="sg-meta">
          <span style={{ color: days.color }}>{days.text}</span>
          {row.lastEva !== null && (
            <span style={{ color: 'var(--muted)' }}>EVA: {row.lastEva}</span>
          )}
          {row.nextAppointment ? (
            <span style={{ color: 'var(--text-main)' }}>
              Próx. cita: {nextApptStr}
              {row.nextAppointment.session_type ? ` · ${row.nextAppointment.session_type}` : ''}
            </span>
          ) : (
            <span style={{ color: 'var(--danger)' }}>Sin cita agendada</span>
          )}
        </div>
      </div>

      <div className="sg-actions">
        {row.phone && (
          <a
            href={buildWhatsAppUrl(row.phone, row.full_name, row.nextAppointment, row.daysSinceContact)}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              textDecoration: 'none', background: '#25d366', color: 'white',
              borderRadius: 14, padding: '6px 12px', fontSize: '0.82rem',
              fontWeight: 700, minHeight: 36, cursor: 'pointer'
            }}
          >
            {WA_ICON}
            WhatsApp
          </a>
        )}
        <button type="button" className="secondary" onClick={() => onPatientSelect(row.id)}>
          Ver expediente
        </button>
      </div>
    </div>
  );
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="sg-section-header">
      <span className="sg-section-label">{label}</span>
      <span className="sg-section-count">{count}</span>
    </div>
  );
}

export function SeguimientosView({ onPatientSelect }: SeguimientosViewProps) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');

  const { data = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['seguimientos'],
    queryFn: () => seguimientosApi.getFollowUps(),
    refetchOnWindowFocus: true
  });

  const todayCount = data.filter((r) => r.todayAppointment !== null).length;
  const criticalCount = data.filter((r) => r.alertLevel === 'critical').length;
  const warningCount = data.filter((r) => r.alertLevel === 'warning').length;
  const okCount = data.filter((r) => r.alertLevel === 'ok').length;
  const totalCount = data.length;

  const baseFiltered = data.filter((r) => {
    if (filter === 'ok' && r.alertLevel !== 'ok') return false;
    if (filter === 'warning' && r.alertLevel !== 'warning') return false;
    if (filter === 'critical' && r.alertLevel !== 'critical') return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return (
        (r.full_name ?? '').toLowerCase().includes(q) ||
        (r.medical_diagnosis ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Groups (data is already sorted: today first, then critical → warning → ok)
  const todayGroup = baseFiltered.filter((r) => r.todayAppointment !== null);
  const criticalGroup = baseFiltered.filter((r) => r.todayAppointment === null && r.alertLevel === 'critical');
  const warningGroup = baseFiltered.filter((r) => r.todayAppointment === null && r.alertLevel === 'warning');
  const okGroup = baseFiltered.filter((r) => r.todayAppointment === null && r.alertLevel === 'ok');

  const isEmpty = baseFiltered.length === 0;

  return (
    <div className="record-stack">
      <header
        className="hero"
        style={{ padding: 24, borderRadius: 22, display: 'flex', alignItems: 'center', gap: 16 }}
      >
        <div>
          <p className="eyebrow" style={{ color: 'rgba(255,255,255,0.7)' }}>
            Seguimiento activo
          </p>
          <h1 style={{ margin: 0, color: 'white' }}>Seguimientos</h1>
        </div>
        <div className="sg-hero-stats">
          <div className="sg-stat">
            <strong style={{ color: '#38bdf8' }}>{todayCount}</strong>
            <span>Hoy</span>
          </div>
          <div className="sg-stat">
            <strong style={{ color: '#ef4444' }}>{criticalCount}</strong>
            <span>Crítico</span>
          </div>
          <div className="sg-stat">
            <strong style={{ color: '#f59e0b' }}>{warningCount}</strong>
            <span>En riesgo</span>
          </div>
          <div className="sg-stat">
            <strong style={{ color: '#22c55e' }}>{okCount}</strong>
            <span>Al día</span>
          </div>
        </div>
      </header>

      <div className="sg-filters">
        <button type="button" className={filter === 'all' ? '' : 'secondary'} onClick={() => setFilter('all')}>
          Todos ({totalCount})
        </button>
        <button type="button" className={filter === 'ok' ? '' : 'secondary'} onClick={() => setFilter('ok')}>
          Al día ({okCount})
        </button>
        <button type="button" className={filter === 'warning' ? '' : 'secondary'} onClick={() => setFilter('warning')}>
          En riesgo ({warningCount})
        </button>
        <button type="button" className={filter === 'critical' ? '' : 'secondary'} onClick={() => setFilter('critical')}>
          Crítico ({criticalCount})
        </button>
      </div>

      <input
        type="search"
        placeholder="Buscar paciente…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid var(--border)', fontSize: '0.9rem', width: '100%' }}
      />

      {isLoading && (
        <>
          <div className="card" aria-busy="true" style={{ minHeight: 72 }} />
          <div className="card" aria-busy="true" style={{ minHeight: 72 }} />
          <div className="card" aria-busy="true" style={{ minHeight: 72 }} />
        </>
      )}

      {isError && (
        <div className="card" style={{ color: 'var(--danger)' }}>
          Error al cargar seguimientos.{' '}
          <button type="button" className="secondary" onClick={() => refetch()}>
            Reintentar
          </button>
        </div>
      )}

      {!isLoading && !isError && isEmpty && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--muted)' }}>
          {search.trim()
            ? 'No se encontraron pacientes con ese criterio.'
            : filter === 'all'
              ? 'No hay pacientes en tratamiento o seguimiento.'
              : filter === 'ok'
                ? 'Ningún paciente al día en este momento.'
                : filter === 'warning'
                  ? 'No hay pacientes en riesgo.'
                  : 'No hay pacientes en estado crítico.'}
        </div>
      )}

      {!isLoading && !isError && !isEmpty && (
        <>
          {/* ── Cita hoy ─────────────────────────────── */}
          {todayGroup.length > 0 && (
            <>
              <SectionHeader label="Cita hoy" count={todayGroup.length} />
              {todayGroup.map((row) => (
                <div key={row.id} className="sg-row sg-row--today">
                  {/* clock icon instead of dot for today */}
                  <span className="sg-today-time" aria-hidden="true">
                    {fmtTime(row.todayAppointment!.starts_at)}
                  </span>

                  <div className="sg-info">
                    <div className="sg-name">
                      {row.full_name ?? '—'}
                      {row.status && (
                        <span className="pill" style={{ marginLeft: 8, fontSize: '0.75rem' }}>
                          {row.status}
                        </span>
                      )}
                    </div>
                    {row.medical_diagnosis && (
                      <div className="sg-diag">{row.medical_diagnosis}</div>
                    )}
                    {row.todayAppointment?.session_type && (
                      <div className="sg-diag" style={{ color: 'var(--text-main)' }}>
                        {row.todayAppointment.session_type}
                      </div>
                    )}
                    {row.lastEva !== null && (
                      <div className="sg-meta">
                        <span style={{ color: 'var(--muted)' }}>EVA: {row.lastEva}</span>
                      </div>
                    )}
                  </div>

                  <div className="sg-actions">
                    {row.phone && (
                      <a
                        href={buildWhatsAppUrl(row.phone, row.full_name, row.nextAppointment, row.daysSinceContact)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          textDecoration: 'none', background: '#25d366', color: 'white',
                          borderRadius: 14, padding: '6px 12px', fontSize: '0.82rem',
                          fontWeight: 700, minHeight: 36, cursor: 'pointer'
                        }}
                      >
                        {WA_ICON}
                        WhatsApp
                      </a>
                    )}
                    <button type="button" className="secondary" onClick={() => onPatientSelect(row.id)}>
                      Ver expediente
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* ── Crítico ───────────────────────────────── */}
          {criticalGroup.length > 0 && (
            <>
              <SectionHeader label="Crítico" count={criticalGroup.length} />
              {criticalGroup.map((row) => (
                <PatientRow key={row.id} row={row} onPatientSelect={onPatientSelect} />
              ))}
            </>
          )}

          {/* ── En riesgo ─────────────────────────────── */}
          {warningGroup.length > 0 && (
            <>
              <SectionHeader label="En riesgo" count={warningGroup.length} />
              {warningGroup.map((row) => (
                <PatientRow key={row.id} row={row} onPatientSelect={onPatientSelect} />
              ))}
            </>
          )}

          {/* ── Al día ────────────────────────────────── */}
          {okGroup.length > 0 && (
            <>
              <SectionHeader label="Al día" count={okGroup.length} />
              {okGroup.map((row) => (
                <PatientRow key={row.id} row={row} onPatientSelect={onPatientSelect} />
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
