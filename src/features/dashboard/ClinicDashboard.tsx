import { Suspense, lazy } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clinicalApi } from '../../services/clinicalApi';
import { calendarService } from '../../services/calendarService';
import { Skeleton } from '../../components/Skeleton';

// FullCalendar pesa ~375 kB. Al cargarlo de forma diferida, el Panel (vista por
// defecto) muestra de inmediato las estadísticas y el calendario se descarga
// aparte — y SOLO si Google Calendar está conectado (si no, nunca se baja).
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
      <header
        className="hero"
        style={{ padding: '24px', borderRadius: '22px', position: 'relative' }}
      >
        <p className="eyebrow" style={{ color: 'rgba(255,255,255,0.7)' }}>
          Agenda y Control
        </p>
        <h1 style={{ fontSize: '32px', color: 'white', marginBottom: '1.5rem' }}>Visión General</h1>

        {/* The NativeCalendar inherits the dark background nicely or can be overridden via css if needed */}
        <div style={{ background: 'white', borderRadius: '18px', padding: '4px' }}>
          {calLoading ? (
            <p style={{ padding: '20px', textAlign: 'center', color: '#666', margin: 0 }}>
              Comprobando conexión con Google...
            </p>
          ) : calStatus?.connected ? (
            <Suspense
              fallback={
                <p style={{ padding: '20px', textAlign: 'center', color: '#666', margin: 0 }}>
                  Cargando agenda…
                </p>
              }
            >
              <NativeCalendar onEventClick={onPatientSelect} />
            </Suspense>
          ) : (
            <p style={{ padding: '20px', textAlign: 'center', color: '#666', margin: 0 }}>
              Google Calendar no está conectado. Ve a "Mi Agenda" para conectarlo.
            </p>
          )}
        </div>
      </header>

      <div
        className="summary-grid"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}
      >
        <div className="card">
          <span>Pacientes Totales</span>
          <strong>{stats.totalPatients}</strong>
        </div>
        <div className="card" style={{ background: 'var(--bg-sunken)' }}>
          <span>Sesiones (este mes)</span>
          <strong>{stats.monthSessions}</strong>
        </div>
        <div className="card" style={{ background: 'var(--bg-sunken)' }}>
          <span>Valoraciones (este mes)</span>
          <strong style={{ color: 'var(--valoracion)' }}>{stats.monthValoraciones}</strong>
        </div>
        <div className="card">
          <span>Citas Pendientes</span>
          <strong>{stats.upcomingAppointments}</strong>
        </div>
      </div>
    </div>
  );
}
