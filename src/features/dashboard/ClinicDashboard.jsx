import { useQuery } from '@tanstack/react-query';
import { clinicalApi } from '../../services/clinicalApi';
import { NativeCalendar } from '../../components/calendar/NativeCalendar';

export function ClinicDashboard({ onPatientSelect }) {
  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['clinic-stats'],
    queryFn: () => clinicalApi.getClinicStats(),
    refetchOnWindowFocus: true
  });

  if (isLoading) return <section className="card" aria-busy="true">Cargando estadisticas...</section>;
  if (error) return <section className="card error">Error al cargar datos: {error.message}</section>;

  return (
    <div className="record-stack">
      <header className="hero" style={{ padding: '24px', borderRadius: '22px' }}>
        <p className="eyebrow" style={{ color: 'rgba(255,255,255,0.7)' }}>Agenda y Control</p>
        <h1 style={{ fontSize: '32px', color: 'white', marginBottom: '1.5rem' }}>Visión General</h1>
        
        {/* The NativeCalendar inherits the dark background nicely or can be overridden via css if needed */}
        <div style={{ background: 'white', borderRadius: '18px', padding: '4px' }}>
          <NativeCalendar onEventClick={onPatientSelect} />
        </div>
      </header>

      <div className="summary-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <div className="card">
          <span>Pacientes Totales</span>
          <strong>{stats.totalPatients}</strong>
        </div>
        <div className="card" style={{ background: 'var(--bg-sunken)' }}>
          <span>Sesiones (Ult. 30 dias)</span>
          <strong>{stats.recentSessions}</strong>
        </div>
        <div className="card">
          <span>Citas Pendientes</span>
          <strong>{stats.upcomingAppointments}</strong>
        </div>
      </div>

      <section className="card">
        <div className="form-header">
          <div>
            <p className="eyebrow">Historial</p>
            <h2>Actividad reciente</h2>
          </div>
        </div>
        
        <ul className="list-stack" style={{ marginTop: '16px', listStyle: 'none', padding: 0 }}>
          {stats.latestActivity.map((item) => (
            <li key={item.id} className="note-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong style={{ display: 'block' }}>{item.patients?.full_name || 'Paciente desconocido'}</strong>
                <span className="muted" style={{ fontSize: '0.85rem' }}>Sesion #{item.session_number} · {item.session_date}</span>
              </div>
              <span className="pill" style={{ background: 'var(--secondary)', color: 'var(--primary)' }}>Guardada</span>
            </li>
          ))}
          {stats.latestActivity.length === 0 && (
            <p className="muted">No hay actividad reciente registrada.</p>
          )}
        </ul>
      </section>
    </div>
  );
}
