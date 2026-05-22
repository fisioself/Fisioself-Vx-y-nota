import { Suspense, lazy, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authService } from './services/authService.js';
import { isSupabaseConfigured } from './lib/supabaseClient.js';
import { draftStorage } from './shared/draftStorage.js';

const LoginScreen = lazy(() =>
  import('./features/auth/LoginScreen.jsx').then((module) => ({ default: module.LoginScreen }))
);
const PatientForm = lazy(() =>
  import('./features/patients/PatientForm.jsx').then((module) => ({ default: module.PatientForm }))
);
const PatientList = lazy(() =>
  import('./features/patients/PatientList.jsx').then((module) => ({ default: module.PatientList }))
);
const PatientRecord = lazy(() =>
  import('./features/patients/PatientRecord.jsx').then((module) => ({
    default: module.PatientRecord
  }))
);

const LoadingCard = ({ children = 'Cargando...' }) => (
  <section className="card" aria-busy="true">
    {children}
  </section>
);

export function App() {
  const queryClient = useQueryClient();
  const [session, setSession] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [showNewPatient, setShowNewPatient] = useState(false);

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
        <div>
          <p className="eyebrow">FISIOSELF App Notas VX</p>
          <h1>Expediente clinico</h1>
          <p>Pacientes, notas, dictado por voz e IA trazable con Supabase.</p>
        </div>
        <div className="hero-actions">
          <span className="pill">{session.user?.email}</span>
          <button type="button" className="secondary" onClick={logout}>
            Salir
          </button>
        </div>
      </header>

      <aside className="left-pane">
        <div className="actions split-actions">
          <button type="button" onClick={() => setShowNewPatient((value) => !value)}>
            {showNewPatient ? 'Cerrar formulario' : 'Nuevo paciente'}
          </button>
        </div>

        <Suspense fallback={<LoadingCard>Cargando pacientes...</LoadingCard>}>
          {showNewPatient && (
            <PatientForm
              onCancel={() => setShowNewPatient(false)}
              onCreated={(patient) => {
                setSelectedPatient(patient);
                setShowNewPatient(false);
                queryClient.invalidateQueries({ queryKey: ['patients'] });
              }}
            />
          )}

          <PatientList
            selectedId={selectedPatient?.id}
            onSelect={setSelectedPatient}
          />
        </Suspense>
      </aside>

      <section className="right-pane">
        <Suspense fallback={<LoadingCard>Cargando expediente...</LoadingCard>}>
          <PatientRecord
            patient={selectedPatient}
            onPatientUpdated={(updatedPatient) => {
              setSelectedPatient(updatedPatient);
              queryClient.invalidateQueries({ queryKey: ['patients'] });
            }}
            onPatientDeleted={() => {
              setSelectedPatient(null);
              queryClient.invalidateQueries({ queryKey: ['patients'] });
            }}
          />
        </Suspense>
      </section>
    </main>
  );
}
