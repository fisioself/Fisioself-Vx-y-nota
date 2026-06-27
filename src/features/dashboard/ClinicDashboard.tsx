import { Suspense, lazy, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clinicalApi } from '../../services/clinicalApi';
import { calendarService } from '../../services/calendarService';
import { Skeleton } from '../../components/Skeleton';

const NativeCalendar = lazy(() =>
  import('../calendar/NativeCalendar').then((m) => ({ default: m.NativeCalendar }))
);

interface ClinicDashboardProps {
  onPatientSelect?: (patientId: string) => void;
  /** Panel de pacientes integrado como columna de la franja superior. */
  sidebar?: ReactNode;
}

export function ClinicDashboard({ onPatientSelect, sidebar }: ClinicDashboardProps) {
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

  // Layout de 3 zonas: la franja superior integra el panel de pacientes
  // (izquierda) con las métricas (derecha); el calendario ocupa TODO el ancho
  // debajo para máxima superficie de agenda. El panel y el calendario se
  // mantienen visibles aunque las estadísticas sigan cargando (sin saltos).
  return (
    <div className={`panel-grid${sidebar ? '' : ' panel-grid--no-sidebar'}`}>
      {sidebar && <div className="panel-patients">{sidebar}</div>}

      {/* Estadísticas clave — globos integrados junto a Pacientes */}
      <div className="panel-stats dashboard-stats" aria-busy={isLoading || undefined}>
        {isLoading ? (
          <>
            <div className="stat-card">
              <Skeleton width="70%" height={11} />
              <Skeleton width="45%" height={26} />
            </div>
            <div className="stat-card stat-card--sunken">
              <Skeleton width="70%" height={11} />
              <Skeleton width="45%" height={26} />
            </div>
            <div className="stat-card stat-card--sunken">
              <Skeleton width="70%" height={11} />
              <Skeleton width="45%" height={26} />
            </div>
            <div className="stat-card">
              <Skeleton width="70%" height={11} />
              <Skeleton width="45%" height={26} />
            </div>
            <span className="sr-only">Cargando estadísticas…</span>
          </>
        ) : error || !stats ? (
          <div className="stat-card error" style={{ gridColumn: '1 / -1' }}>
            Error al cargar datos: {error?.message || ''}
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>

      {/* Calendario a todo el ancho — la zona protagonista del panel */}
      <section className="card panel-calendar">
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
