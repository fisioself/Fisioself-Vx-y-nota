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
  if (days === null) return { text: 'Sin contacto registrado', color: 'var(--muted)' };
  if (days === 0) return { text: 'Contacto hoy', color: 'var(--income)' };
  if (days === 1) return { text: 'Contacto ayer', color: 'var(--income)' };
  if (days < 14) return { text: `Hace ${days} días`, color: 'var(--text-main)' };
  if (days < 30) return { text: `⚠️ Hace ${days} días`, color: '#d97706' };
  return { text: `🔴 Hace ${days} días`, color: 'var(--danger)' };
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

type FilterKey = 'all' | 'ok' | 'warning' | 'critical';

export function SeguimientosView({ onPatientSelect }: SeguimientosViewProps) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');

  const { data = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['seguimientos'],
    queryFn: () => seguimientosApi.getFollowUps(),
    refetchOnWindowFocus: true
  });

  const criticalCount = data.filter((r) => r.alertLevel === 'critical').length;
  const warningCount = data.filter((r) => r.alertLevel === 'warning').length;
  const okCount = data.filter((r) => r.alertLevel === 'ok').length;
  const totalCount = data.length;

  const filtered = data.filter((r) => {
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
        <button
          type="button"
          className={filter === 'all' ? '' : 'secondary'}
          onClick={() => setFilter('all')}
        >
          Todos ({totalCount})
        </button>
        <button
          type="button"
          className={filter === 'ok' ? '' : 'secondary'}
          onClick={() => setFilter('ok')}
        >
          Al día ({okCount})
        </button>
        <button
          type="button"
          className={filter === 'warning' ? '' : 'secondary'}
          onClick={() => setFilter('warning')}
        >
          En riesgo ({warningCount})
        </button>
        <button
          type="button"
          className={filter === 'critical' ? '' : 'secondary'}
          onClick={() => setFilter('critical')}
        >
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

      {!isLoading && !isError && filtered.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--muted)' }}>
          {search.trim()
            ? 'No se encontraron pacientes con ese criterio.'
            : filter === 'all'
              ? 'No hay pacientes en tratamiento o seguimiento.'
              : filter === 'ok'
                ? 'Ningún paciente en esta categoría.'
                : filter === 'warning'
                  ? 'No hay pacientes en riesgo.'
                  : 'No hay pacientes en estado crítico.'}
        </div>
      )}

      {!isLoading &&
        !isError &&
        filtered.map((row) => {
          const days = fmtDays(row.daysSinceContact);
          const nextApptStr = fmtNextAppt(row.nextAppointment);

          return (
            <div key={row.id} className="sg-row">
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
                      Prox. cita: {nextApptStr}
                      {row.nextAppointment.session_type
                        ? ` · ${row.nextAppointment.session_type}`
                        : ''}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--danger)' }}>Sin cita</span>
                  )}
                </div>
              </div>

              <div className="sg-actions">
                {row.phone && (
                  <a
                    href={buildWhatsAppUrl(
                      row.phone,
                      row.full_name,
                      row.nextAppointment,
                      row.daysSinceContact
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="sg-wa-btn"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      textDecoration: 'none',
                      borderRadius: 14,
                      padding: '6px 12px',
                      fontSize: '0.82rem',
                      fontWeight: 800,
                      minHeight: 36
                    }}
                  >
                    WhatsApp
                  </a>
                )}
                <button
                  type="button"
                  className="secondary"
                  onClick={() => onPatientSelect(row.id)}
                >
                  Ver expediente
                </button>
              </div>
            </div>
          );
        })}
    </div>
  );
}
