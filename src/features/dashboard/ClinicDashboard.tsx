import { Suspense, lazy } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clinicalApi } from '../../services/clinicalApi';
import { calendarService } from '../../services/calendarService';
import { Skeleton } from '../../components/Skeleton';

const NativeCalendar = lazy(() =>
  import('../../components/calendar/NativeCalendar').then((m) => ({ default: m.NativeCalendar }))
);

interface ClinicDashboardProps {
  onPatientSelect?: (patientId: string) => void;
}

export function ClinicDashboard({ onPatientSelect }: ClinicDashboardProps) {
  const { data: calStatus, isLoading: calLoading } = useQuery({
    queryKey: ['calendar-connection'],
    queryFn: () => calendarService.getConnectionStatus(),
    retry: false
  });

  const {
    data: stats,
    isLoading,
    error
  } = useQuery({
    queryKey: ['clinic-stats'],
    queryFn: () => clinicalApi.getClinicStats(),
    refetchOnWindowFocus: true
  });

  if (isLoading)
    return (
      <section className="card" aria-busy="true">
        <Skeleton width="35%" height={20} />
        <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
          <Skeleton width={110} height={64} radius={14} />
          <Skeleton width={110} height={64} radius={14} />
          <Skeleton width={110} height={64} radius={14} />
          <Skeleton width={110} height={64} radius={14} />
        </div>
        <span className="sr-only">Cargando estadísticas…</span>
      </section>
    );
  if (error || !stats)
    return <section className="card error">Error al cargar datos: {error?.message || ''}</section>;

  return (
    <div className="record-stack">
      {/* Estadísticas clave */}
      <div className="dashboard-stats">
        <div className="stat-card">
          <span className="stat-label">Pacientes totales</span>
          <strong className="stat-value">{stats.totalPatients}</strong>
        </div>
        <div className="stat-card stat-card--sunken">
          <span className="stat-label">Sesiones este mes</span>
          <strong className="stat-value">{stats.monthSessions}</strong>
        </div>
        <div className="stat-card stat-card--sunken">
          <span className="stat-label">Valoraciones este mes</span>
          <strong className="stat-value" style={{ color: 'var(--valoracion)' }}>
            {stats.monthValoraciones}
          </strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Citas pendientes</span>
          <strong className="stat-value">{stats.upcomingAppointments}</strong>
        </div>
      </div>

      {/* Calendario como tarjeta independiente */}
      <section className="card">
        <div className="form-header" style={{ marginBottom: 12 }}>
          <div>
            <p className="eyebrow">Agenda</p>
            <h2>Calendario</h2>
          </div>
        </div>
        {calLoading ? (
          <p className="muted" style={{ textAlign: 'center', padding: '20px 0' }}>
            Comprobando conexión con Google…
          </p>
        ) : calStatus?.connected ? (
          <Suspense
            fallback={
              <p className="muted" style={{ textAlign: 'center', padding: '20px 0' }}>
                Cargando agenda…
              </p>
            }
          >
            <NativeCalendar onEventClick={onPatientSelect} />
          </Suspense>
        ) : (
          <p className="muted" style={{ textAlign: 'center', padding: '20px 0' }}>
            Google Calendar no está conectado. Ve a «Mi Agenda» para conectarlo.
          </p>
        )}
      </section>
    </div>
  );
}
