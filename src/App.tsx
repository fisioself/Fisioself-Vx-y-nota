import { Suspense, lazy, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { authService } from './services/authService';
import { isSupabaseConfigured } from './lib/supabaseClient';
import { draftStorage } from './shared/draftStorage';
import { offlineNotes } from './shared/offlineNotes';
import { offlinePayments } from './shared/offlinePayments';
import { useOfflineNoteSync } from './shared/useOfflineNoteSync';
import { useOfflinePaymentSync } from './shared/useOfflinePaymentSync';
import { clearPersistedQueryCache } from './lib/offlineSync';
import { setUser as sentrySetUser, clearUser as sentryClearUser } from './lib/sentry';
import { AppLogo } from './components/AppLogo';
import { PushNotificationButton } from './features/notifications/PushNotificationButton';
import { PanelErrorBoundary } from './app/ErrorBoundary';
import { GlobalSearch } from './features/search/GlobalSearch';
import { SeguimientosView } from './features/seguimientos/SeguimientosView';
import type { Patient } from './types/clinical';

interface LoginScreenProps {
  onLogin: (session: Session | null) => void;
}
interface MfaChallengeProps {
  factorId: string;
  onVerified: () => void;
  onCancel: () => void;
}
interface MfaSettingsProps {
  onClose: () => void;
}
interface PatientFormProps {
  onCreated: (patient: Patient) => void;
  onCancel: () => void;
}
interface PatientListProps {
  selectedId?: string | null;
  onSelect: (patient: Patient) => void;
  onNewPatient?: () => void;
  newPatientActive?: boolean;
}
interface PatientRecordProps {
  patient: Partial<Patient> | null;
  onPatientUpdated: (patient: Patient) => void;
  onPatientDeleted: () => void;
}
interface DashboardProps {
  onPatientSelect: (patientId: string) => void;
  /** Panel de pacientes integrado como columna de la franja superior. */
  sidebar?: ReactNode;
}
interface FinanceProps {
  onPatientSelect: (patientId: string) => void;
}

const LoginScreen = lazy(() =>
  import('./features/auth/LoginScreen').then((module) => ({ default: module.LoginScreen }))
) as ComponentType<LoginScreenProps>;
const MfaChallenge = lazy(() =>
  import('./features/auth/MfaChallenge').then((module) => ({ default: module.MfaChallenge }))
) as ComponentType<MfaChallengeProps>;
const MfaSettings = lazy(() =>
  import('./features/auth/MfaSettings').then((module) => ({ default: module.MfaSettings }))
) as ComponentType<MfaSettingsProps>;
const PatientForm = lazy(() =>
  import('./features/patients/PatientForm').then((module) => ({ default: module.PatientForm }))
) as ComponentType<PatientFormProps>;
const PatientList = lazy(() =>
  import('./features/patients/PatientList').then((module) => ({ default: module.PatientList }))
) as ComponentType<PatientListProps>;
const PatientRecord = lazy(() =>
  import('./features/patients/PatientRecord').then((module) => ({
    default: module.PatientRecord
  }))
) as ComponentType<PatientRecordProps>;
const FinanceView = lazy(() =>
  import('./features/finance/FinanceView').then((module) => ({
    default: module.FinanceView
  }))
) as ComponentType<FinanceProps>;
const ClinicDashboard = lazy(() =>
  import('./features/dashboard/ClinicDashboard').then((module) => ({
    default: module.ClinicDashboard
  }))
) as ComponentType<DashboardProps>;

const LoadingCard = ({ children = 'Cargando...' }: { children?: ReactNode }) => (
  <section className="card" aria-busy="true">
    {children}
  </section>
);

// Carrera contra un timeout: usado en el arranque para que una llamada de red
// lenta o colgada (sin conexión) NUNCA deje la app atrapada en el spinner.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
  ]);
}

const isOffline = (): boolean => typeof navigator !== 'undefined' && navigator.onLine === false;

export function App() {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [selectedPatient, setSelectedPatient] = useState<Partial<Patient> | null>(null);
  const [showNewPatient, setShowNewPatient] = useState(false);
  const [showFinance, setShowFinance] = useState(false);
  const [showSeguimientos, setShowSeguimientos] = useState(false);
  const [showDashboard, setShowDashboard] = useState(true);
  const [fromSeguimientos, setFromSeguimientos] = useState(false);
  const [showMfaSettings, setShowMfaSettings] = useState(false);
  // Si el usuario tiene 2FA activo, aquí guardamos el id del factor que debe
  // resolver el reto tras iniciar sesión. mfaChecking evita mostrar la app
  // mientras averiguamos si hace falta el segundo factor.
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaChecking, setMfaChecking] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Vacía las colas offline (notas y cobros) cuando vuelve el internet.
  useOfflineNoteSync();
  useOfflinePaymentSync();

  // Siempre tema claro.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    localStorage.removeItem('fisioself-theme');
  }, []);

  // ⌘K / Ctrl+K → abre la búsqueda global.
  useEffect(() => {
    if (!session) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [session]);

  useEffect(() => {
    let cancelled = false;

    // Failsafe: el arranque NUNCA debe quedarse colgado en el spinner. Si la
    // verificación de sesión tarda (red lenta o SIN conexión), liberamos la
    // pantalla de carga igual; `onAuthStateChange` emite la sesión persistida
    // (evento INITIAL_SESSION) en cuanto está lista, así que la app entra con la
    // sesión guardada aunque no haya internet. Esto arregla el spinner eterno
    // offline.
    const failsafe = setTimeout(() => {
      if (!cancelled) setCheckingAuth(false);
    }, 3000);

    async function loadSession() {
      if (!isSupabaseConfigured) {
        setCheckingAuth(false);
        return;
      }
      try {
        const current = await authService.getSession();
        if (!cancelled) setSession(current);
      } catch {
        if (!cancelled) setSession(null);
      } finally {
        if (!cancelled) setCheckingAuth(false);
      }
    }

    loadSession();
    const subscription = authService.onAuthStateChange((s) => {
      setSession(s);
      // Etiqueta los errores de Sentry con el ID opaco del usuario (sin PII).
      if (s?.user?.id) sentrySetUser(s.user.id);
      else sentryClearUser();
    });
    return () => {
      cancelled = true;
      clearTimeout(failsafe);
      subscription?.unsubscribe?.();
    };
  }, []);

  // Cada vez que cambia la sesión, comprobamos si el usuario debe resolver el
  // reto 2FA (tiene un factor verificado pero la sesión es solo de contraseña).
  useEffect(() => {
    let cancelled = false;

    async function checkMfa() {
      if (!isSupabaseConfigured || !session) {
        setMfaFactorId(null);
        return;
      }
      // Sin conexión no podemos (ni necesitamos) verificar el 2FA contra el
      // servidor: la sesión ya está validada localmente y RLS protege los datos
      // en el servidor. No bloqueamos el arranque; entramos en modo lectura
      // offline. (Sin esto, el chequeo de red se colgaba y dejaba el spinner.)
      if (isOffline()) {
        setMfaFactorId(null);
        setMfaChecking(false);
        return;
      }
      setMfaChecking(true);
      try {
        // Con timeout: si la red está colgada, no dejamos el arranque atrapado.
        const needs = await withTimeout(authService.needsMfaChallenge(), 6000);
        if (!needs) {
          if (!cancelled) setMfaFactorId(null);
          return;
        }
        const factors = await authService.listMfaFactors();
        const verified = factors.find((f) => f.status === 'verified');
        if (!cancelled) setMfaFactorId(verified ? verified.id : null);
      } catch {
        // Ante un fallo de red no bloqueamos: RLS sigue protegiendo los datos.
        if (!cancelled) setMfaFactorId(null);
      } finally {
        if (!cancelled) setMfaChecking(false);
      }
    }

    checkMfa();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const logout = async () => {
    await authService.signOut();
    draftStorage.clearAll();
    // Datos escritos sin conexión (PHI / finanzas): no deben quedar en el
    // navegador tras el logout. (Quedan sin sincronizar si se cierra sesión sin
    // internet, igual que los borradores.)
    offlineNotes.clearAll();
    offlinePayments.clearAll();
    // Vacía el caché de React Query (memoria + IndexedDB) para no dejar datos
    // clínicos de pacientes legibles en el navegador tras cerrar sesión.
    queryClient.clear();
    await clearPersistedQueryCache();
    sentryClearUser();
    setSelectedPatient(null);
    setShowFinance(false);
    setShowSeguimientos(false);
    setShowMfaSettings(false);
    setMfaFactorId(null);
    setSession(null);
  };

  if (!isSupabaseConfigured) {
    return (
      <main className="shell">
        <section className="card warning">
          <p className="eyebrow">Configuracion pendiente</p>
          <h1>Falta conectar Supabase</h1>
          <p>Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en el deploy de esta app.</p>
        </section>
      </main>
    );
  }

  if (checkingAuth) {
    return (
      <div className="app-loading">
        <div className="app-loading-inner">
          <AppLogo size={110} pulse />
          <p>FISIOSELF VX</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <Suspense fallback={<LoadingCard>Cargando acceso...</LoadingCard>}>
        <LoginScreen onLogin={setSession} />
      </Suspense>
    );
  }

  // El usuario inició sesión pero tiene 2FA activo: bloqueamos la app hasta
  // resolver el reto del segundo factor.
  if (mfaFactorId) {
    return (
      <Suspense fallback={<LoadingCard>Cargando verificación...</LoadingCard>}>
        <MfaChallenge
          factorId={mfaFactorId}
          onVerified={() => setMfaFactorId(null)}
          onCancel={logout}
        />
      </Suspense>
    );
  }

  // Mientras comprobamos si hace falta el segundo factor, no mostramos datos.
  if (mfaChecking) {
    return (
      <div className="app-loading">
        <div className="app-loading-inner">
          <AppLogo size={110} pulse />
          <p>FISIOSELF VX</p>
        </div>
      </div>
    );
  }

  // El panel de pacientes (búsqueda + lista) ya no vive como barra lateral
  // permanente: en el Panel se integra DENTRO del dashboard, como columna de la
  // franja superior junto a las métricas, para que el calendario ocupe todo el
  // ancho. Solo en el alta de paciente se muestra como barra lateral clásica
  // junto al formulario → única vista de dos columnas.
  const twoColumn = showNewPatient;
  // Se calcula aquí, fuera del JSX, para mantener el tipo `string | undefined`
  // sin que TS lo estreche a `never` dentro de bloques condicionales.
  const selectedPatientId = selectedPatient?.id;

  // Panel de pacientes reutilizable: barra lateral en el alta y columna
  // integrada del dashboard en el Panel. Se define una vez para no duplicar
  // los handlers de selección/alta.
  const patientListPanel = (
    <PanelErrorBoundary label="lista de pacientes">
      <Suspense fallback={<LoadingCard>Cargando pacientes...</LoadingCard>}>
        <PatientList
          selectedId={selectedPatientId}
          newPatientActive={showNewPatient}
          onNewPatient={() => {
            if (showNewPatient) {
              setShowNewPatient(false);
              setShowDashboard(true);
            } else {
              setShowNewPatient(true);
              setShowDashboard(false);
              setSelectedPatient(null);
            }
          }}
          onSelect={(patient) => {
            setSelectedPatient(patient);
            setShowFinance(false);
            setShowDashboard(false);
            setShowNewPatient(false);
          }}
        />
      </Suspense>
    </PanelErrorBoundary>
  );

  return (
    <main className={`shell app-grid${twoColumn ? '' : ' finance-mode'}`}>
      {searchOpen && (
        <GlobalSearch
          onSelectPatient={(patient) => {
            setSelectedPatient(patient);
            setShowFinance(false);
            setShowDashboard(false);
            setSearchOpen(false);
          }}
          onNavigate={(view) => {
            if (view === 'finance') {
              setShowFinance(true);
              setShowDashboard(false);
            } else {
              setShowDashboard(true);
              setShowFinance(false);
            }
            setSelectedPatient(null);
            setSearchOpen(false);
          }}
          onClose={() => setSearchOpen(false)}
        />
      )}

      <header className="app-topbar">
        <div className="topbar-brand">
          <AppLogo size={44} />
          <h1 style={{ margin: 0 }}>Fisioself</h1>
        </div>

        <nav className="main-tabs">
          <button
            type="button"
            className={
              showDashboard ||
              showNewPatient ||
              (!showFinance && !showSeguimientos && selectedPatient)
                ? ''
                : 'secondary'
            }
            onClick={() => {
              window.scrollTo({ top: 0, behavior: 'smooth' });
              setShowDashboard(true);
              setShowFinance(false);
              setShowSeguimientos(false);
              setFromSeguimientos(false);
              setSelectedPatient(null);
              setShowNewPatient(false);
            }}
          >
            Panel
          </button>
          <button
            type="button"
            className={showFinance ? '' : 'secondary'}
            onClick={() => {
              window.scrollTo({ top: 0, behavior: 'smooth' });
              setShowFinance(true);
              setShowDashboard(false);
              setShowSeguimientos(false);
              setSelectedPatient(null);
              setShowNewPatient(false);
            }}
          >
            Finanzas
          </button>
          <button
            type="button"
            className={showSeguimientos ? '' : 'secondary'}
            onClick={() => {
              window.scrollTo({ top: 0, behavior: 'smooth' });
              setShowSeguimientos(true);
              setShowFinance(false);
              setShowDashboard(false);
              setSelectedPatient(null);
              setShowNewPatient(false);
            }}
          >
            <span className="tab-cal-icon" aria-hidden="true">
              {new Date().getDate()}
            </span>
            Seguimientos
          </button>
        </nav>

        <div className="hero-actions">
          {session.user?.id && <PushNotificationButton userId={session.user.id} />}
          <button
            type="button"
            className="secondary"
            onClick={() => setSearchOpen(true)}
            title="Búsqueda global (Ctrl+K)"
            aria-label="Búsqueda global"
          >
            <span aria-hidden="true">🔍</span>
            <span className="btn-label">Buscar</span>
          </button>
          {/* Seguridad y Salir como íconos compactos agrupados */}
          <div className="hero-icon-group">
            <button
              type="button"
              className="secondary hero-icon-btn"
              onClick={() => setShowMfaSettings(true)}
              aria-label="Seguridad"
              title={`Seguridad · ${session.user?.email ?? ''}`}
            >
              🛡️
            </button>
            <button
              type="button"
              className="secondary hero-icon-btn"
              onClick={logout}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
            >
              🚪
            </button>
          </div>
        </div>
      </header>

      {showMfaSettings && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Configuración de seguridad"
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 1000
          }}
        >
          {/* Fondo clicable (y accesible por teclado) para cerrar el diálogo. */}
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => setShowMfaSettings(false)}
            style={{
              position: 'fixed',
              inset: 0,
              border: 'none',
              padding: 0,
              background: 'rgba(0,0,0,0.45)',
              cursor: 'pointer'
            }}
          />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <Suspense fallback={<LoadingCard>Cargando...</LoadingCard>}>
              <MfaSettings onClose={() => setShowMfaSettings(false)} />
            </Suspense>
          </div>
        </div>
      )}

      {twoColumn && <aside className="left-pane">{patientListPanel}</aside>}

      <section className="right-pane">
        <PanelErrorBoundary label="el panel principal">
          <Suspense fallback={<LoadingCard>Cargando datos...</LoadingCard>}>
            {showNewPatient ? (
              <PatientForm
                onCancel={() => {
                  setShowNewPatient(false);
                  setShowDashboard(true);
                }}
                onCreated={(patient) => {
                  setSelectedPatient(patient);
                  setShowFinance(false);
                  setShowSeguimientos(false);
                  setShowDashboard(false);
                  setShowNewPatient(false);
                  queryClient.invalidateQueries({ queryKey: ['patients'] });
                }}
              />
            ) : showSeguimientos ? (
              <SeguimientosView
                onPatientSelect={(id) => {
                  setFromSeguimientos(true);
                  setSelectedPatient({ id });
                  setShowSeguimientos(false);
                  setShowDashboard(false);
                }}
              />
            ) : showDashboard ? (
              <ClinicDashboard
                sidebar={patientListPanel}
                onPatientSelect={(patientId) => {
                  setSelectedPatient({ id: patientId });
                  setShowFinance(false);
                  setShowDashboard(false);
                }}
              />
            ) : showFinance ? (
              <FinanceView
                onPatientSelect={(patientId) => {
                  setSelectedPatient({ id: patientId });
                  setShowFinance(false);
                  setShowDashboard(false);
                }}
              />
            ) : (
              <PatientRecord
                patient={selectedPatient}
                onPatientUpdated={(updatedPatient) => {
                  setSelectedPatient(updatedPatient);
                  // Al renombrar / cambiar teléfono, refrescamos también la agenda
                  // y seguimientos: ambos leen el nombre/telefono del paciente y
                  // mostraban datos viejos en caché (nombre antiguo, sin WhatsApp).
                  queryClient.invalidateQueries({ queryKey: ['patients'] });
                  queryClient.invalidateQueries({ queryKey: ['seguimientos'] });
                  queryClient.invalidateQueries({ queryKey: ['appointments'] });
                }}
                onPatientDeleted={() => {
                  const backToSeg = fromSeguimientos;
                  setFromSeguimientos(false);
                  setSelectedPatient(null);
                  setShowSeguimientos(backToSeg);
                  setShowDashboard(!backToSeg);
                  queryClient.invalidateQueries({ queryKey: ['patients'] });
                  queryClient.invalidateQueries({ queryKey: ['seguimientos'] });
                }}
              />
            )}
          </Suspense>
        </PanelErrorBoundary>
      </section>
    </main>
  );
}
