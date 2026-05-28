import { Suspense, lazy, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { authService } from './services/authService';
import { isSupabaseConfigured } from './lib/supabaseClient';
import { draftStorage } from './shared/draftStorage';
import { useTheme } from './shared/useTheme';
import type { Patient } from './types/clinical';

interface LoginScreenProps {
  onLogin: (session: Session | null) => void;
}
interface PatientFormProps {
  onCreated: (patient: Patient) => void;
  onCancel: () => void;
}
interface PatientListProps {
  selectedId?: string | null;
  onSelect: (patient: Patient) => void;
}
interface PatientRecordProps {
  patient: Patient | null;
  onPatientUpdated: (patient: Patient) => void;
  onPatientDeleted: () => void;
}
interface DashboardProps {
  onPatientSelect: (patientId: string) => void;
}
interface AgendaProps {
  onPatientSelect: (patientId: string) => void;
}

const LoginScreen = lazy(() =>
  import('./features/auth/LoginScreen').then((module) => ({ default: module.LoginScreen }))
) as ComponentType<LoginScreenProps>;
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
const AgendaView = lazy(() =>
  import('./features/appointments/AgendaView').then((module) => ({
    default: module.AgendaView
  }))
) as ComponentType<AgendaProps>;
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

export function App() {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [showNewPatient, setShowNewPatient] = useState(false);
  const [showAgenda, setShowAgenda] = useState(false);
  const [showDashboard, setShowDashboard] = useState(true);

  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    let cancelled = false;

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
    const subscription = authService.onAuthStateChange(setSession);
    return () => {
      cancelled = true;
      subscription?.unsubscribe?.();
    };
  }, []);

  const logout = async () => {
    await authService.signOut();
    draftStorage.clearAll();
    setSelectedPatient(null);
    setShowAgenda(false);
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
      <main className="shell">
        <section className="card">Verificando sesion...</section>
      </main>
    );
  }

  if (!session) {
    return (
      <Suspense fallback={<LoadingCard>Cargando acceso...</LoadingCard>}>
        <LoginScreen onLogin={setSession} />
      </Suspense>
    );
  }

  return (
    <main className="shell app-grid">
      <header className="hero app-hero">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <img
            src="/logo.jpg"
            alt="FISIOSELF"
            width="56"
            height="56"
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              objectFit: 'cover',
              flexShrink: 0
            }}
          />
          <div>
            <p className="eyebrow">FISIOSELF App Notas VX</p>
            <h1>Expediente clinico</h1>
            <p>Pacientes, notas, dictado por voz e IA trazable con Supabase.</p>
          </div>
        </div>
        <div className="hero-actions">
          <button type="button" className="secondary" onClick={toggleTheme} title="Cambiar tema">
            {theme === 'light' ? '🌙 Modo Oscuro' : '☀️ Modo Claro'}
          </button>
          <span className="pill">{session.user?.email}</span>
          <button type="button" className="secondary" onClick={logout}>
            Salir
          </button>
        </div>
      </header>

      <aside className="left-pane">
        <div className="actions split-actions" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <button
            type="button"
            className={showDashboard ? '' : 'secondary'}
            onClick={() => {
              setShowDashboard(true);
              setShowAgenda(false);
              setSelectedPatient(null);
            }}
          >
            Panel
          </button>
          <button
            type="button"
            className={showAgenda ? '' : 'secondary'}
            onClick={() => {
              setShowAgenda(true);
              setShowDashboard(false);
              setSelectedPatient(null);
            }}
          >
            Agenda
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setShowAgenda(false);
              setShowDashboard(false);
              setShowNewPatient((value) => !value);
            }}
          >
            {showNewPatient ? 'Cerrar' : '+ Paciente'}
          </button>
        </div>

        <Suspense fallback={<LoadingCard>Cargando pacientes...</LoadingCard>}>
          {showNewPatient && (
            <PatientForm
              onCancel={() => setShowNewPatient(false)}
              onCreated={(patient) => {
                setSelectedPatient(patient);
                setShowAgenda(false);
                setShowDashboard(false);
                setShowNewPatient(false);
                queryClient.invalidateQueries({ queryKey: ['patients'] });
              }}
            />
          )}

          <PatientList
            selectedId={selectedPatient?.id}
            onSelect={(patient) => {
              setSelectedPatient(patient);
              setShowAgenda(false);
              setShowDashboard(false);
            }}
          />
        </Suspense>
      </aside>

      <section className="right-pane">
        <Suspense fallback={<LoadingCard>Cargando datos...</LoadingCard>}>
          {showDashboard ? (
            <ClinicDashboard onPatientSelect={(patientId) => {
              setSelectedPatient({ id: patientId });
              setShowAgenda(false);
              setShowDashboard(false);
            }} />
          ) : showAgenda ? (
            <AgendaView onPatientSelect={(patientId) => {
              setSelectedPatient({ id: patientId });
              setShowAgenda(false);
              setShowDashboard(false);
            }} />
          ) : (
            <PatientRecord
              patient={selectedPatient}
              onPatientUpdated={(updatedPatient) => {
                setSelectedPatient(updatedPatient);
                queryClient.invalidateQueries({ queryKey: ['patients'] });
              }}
              onPatientDeleted={() => {
                setSelectedPatient(null);
                setShowDashboard(true);
                queryClient.invalidateQueries({ queryKey: ['patients'] });
              }}
            />
          )}
        </Suspense>
      </section>
    </main>
  );
}
