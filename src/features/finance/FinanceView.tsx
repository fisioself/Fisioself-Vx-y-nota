import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { financeApi } from '../../services/financeApi';
import { clinicalApi } from '../../services/clinicalApi';
import type { Patient } from '../../types/clinical';
import { money, CATEGORY_COLORS } from './financeUtils';
import { BarChart, GroupedBarChart, GrowthBadge } from './FinanceCharts';
import { ExpensesPanel } from './ExpensesPanel';
import { PatientFinancePanel } from './PatientFinancePanel';
import { CajaPanel } from './CajaPanel';
import { MonthlyHistory } from './MonthlyHistory';
import { Skeleton } from '../../components/Skeleton';

interface FinanceViewProps {
  onPatientSelect?: (patientId: string) => void;
}

export function FinanceView(_props: FinanceViewProps) {
  const [query, setQuery] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  const {
    data: summary,
    isLoading,
    isError,
    refetch
  } = useQuery({
    queryKey: ['finance-global'],
    queryFn: () => financeApi.getGlobalFinance(12)
  });

  const { data: results = [] } = useQuery({
    queryKey: ['finance-patient-search', query],
    queryFn: () => clinicalApi.searchPatients(query),
    enabled: query.trim().length >= 2
  });

  const cm = summary?.currentMonth;
  const d30 = summary?.last30d;
  const caja = summary?.caja;
  const netChart = useMemo(
    () => (summary?.monthly ?? []).map((m) => ({ month: m.month, value: m.net })),
    [summary]
  );
  const patientsChart = useMemo(
    () =>
      (summary?.monthly ?? []).map((m) => ({
        month: m.month,
        a: m.patients,
        b: m.newPatients
      })),
    [summary]
  );

  return (
    <div className="record-stack">
      <header className="hero" style={{ padding: 24, borderRadius: 22 }}>
        <p className="eyebrow" style={{ color: 'rgba(255,255,255,0.7)' }}>
          Control financiero y métricas
        </p>
        <h1 style={{ fontSize: 30, color: 'white', margin: 0 }}>Finanzas y métricas</h1>
      </header>

      {isLoading ? (
        <section className="card" aria-busy="true">
          <Skeleton width="40%" height={20} />
          <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
            <Skeleton width={120} height={70} radius={14} />
            <Skeleton width={120} height={70} radius={14} />
            <Skeleton width={120} height={70} radius={14} />
          </div>
          <Skeleton width="100%" height={180} radius={14} style={{ marginTop: 16 }} />
          <span className="sr-only">Cargando finanzas…</span>
        </section>
      ) : isError ? (
        <section className="card" role="alert">
          <h2>Error al cargar las finanzas</h2>
          <p className="muted">
            No se pudieron obtener los datos financieros. Revisa tu conexión e inténtalo de nuevo.
          </p>
          <button type="button" onClick={() => refetch()}>
            Reintentar
          </button>
        </section>
      ) : (
        <>
          {/* Cobros y paquetes — al inicio para acceso rápido */}
          <section className="card">
            <div className="form-header">
              <div>
                <p className="eyebrow">Por paciente</p>
                <h2>Cobros y paquetes</h2>
              </div>
            </div>
            <input
              type="search"
              placeholder="Buscar paciente por nombre o teléfono…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ marginTop: 12, width: '100%' }}
            />
            {query.trim().length >= 2 && (
              <ul className="list-stack" style={{ marginTop: 10, listStyle: 'none', padding: 0 }}>
                {results.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="secondary"
                      style={{ width: '100%', textAlign: 'left' }}
                      onClick={() => {
                        setSelectedPatient(p);
                        setQuery('');
                      }}
                    >
                      {p.full_name}
                      {p.phone ? ` · ${p.phone}` : ''}
                    </button>
                  </li>
                ))}
                {results.length === 0 && <p className="muted">Sin resultados.</p>}
              </ul>
            )}
          </section>

          {selectedPatient && <PatientFinancePanel patient={selectedPatient} />}

          <CajaPanel caja={caja} />

          {/* === Mes en curso === */}
          <section className="card">
            <div className="form-header">
              <div>
                <p className="eyebrow">Mes en curso</p>
                <h2>¿Cómo vamos este mes?</h2>
              </div>
            </div>
            <div
              className="summary-grid"
              style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', marginTop: 12 }}
            >
              <div className="card">
                <span>Ingresos</span>
                <strong style={{ color: 'var(--income)' }}>{money(cm?.income ?? 0)}</strong>
                <GrowthBadge value={summary?.growth.income ?? null} />
              </div>
              <div className="card">
                <span>Gastos</span>
                <strong style={{ color: 'var(--expense)' }}>{money(cm?.expenses ?? 0)}</strong>
              </div>
              <div className="card">
                <span>Ganancia neta</span>
                <strong style={{ color: (cm?.net ?? 0) >= 0 ? 'var(--income)' : 'var(--expense)' }}>
                  {money(cm?.net ?? 0)}
                </strong>
              </div>
              <div className="card" style={{ background: 'var(--bg-sunken)' }}>
                <span>Pacientes atendidos</span>
                <strong>{cm?.patients ?? 0}</strong>
                <GrowthBadge value={summary?.growth.patients ?? null} />
              </div>
              <div className="card" style={{ background: 'var(--bg-sunken)' }}>
                <span>Sesiones cobradas</span>
                <strong>{cm?.sessions ?? 0}</strong>
              </div>
              <div className="card" style={{ background: 'var(--bg-sunken)' }}>
                <span>Valoraciones</span>
                <strong style={{ color: 'var(--valoracion)' }}>{cm?.valoraciones ?? 0}</strong>
              </div>
            </div>
          </section>

          {/* === Últimos 30 días === */}
          <section className="card">
            <div className="form-header">
              <div>
                <p className="eyebrow">Últimos 30 días</p>
                <h2>Ventana móvil</h2>
              </div>
            </div>
            <div
              className="summary-grid"
              style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', marginTop: 12 }}
            >
              <div className="card">
                <span>Ingresos</span>
                <strong style={{ color: 'var(--income)' }}>{money(d30?.income ?? 0)}</strong>
              </div>
              <div className="card">
                <span>Gastos</span>
                <strong style={{ color: 'var(--expense)' }}>{money(d30?.expenses ?? 0)}</strong>
              </div>
              <div className="card">
                <span>Ganancia neta</span>
                <strong style={{ color: (d30?.net ?? 0) >= 0 ? 'var(--income)' : 'var(--expense)' }}>
                  {money(d30?.net ?? 0)}
                </strong>
              </div>
              <div className="card" style={{ background: 'var(--bg-sunken)' }}>
                <span>Pacientes atendidos</span>
                <strong>{d30?.patients ?? 0}</strong>
              </div>
              <div className="card" style={{ background: 'var(--bg-sunken)' }}>
                <span>Sesiones cobradas</span>
                <strong>{d30?.sessions ?? 0}</strong>
              </div>
              <div className="card" style={{ background: 'var(--bg-sunken)' }}>
                <span>Valoraciones</span>
                <strong style={{ color: 'var(--valoracion)' }}>{d30?.valoraciones ?? 0}</strong>
              </div>
            </div>
          </section>

          {/* === Historial: ganancia neta por mes === */}
          <section className="card">
            <div className="form-header">
              <div>
                <p className="eyebrow">Historial mensual</p>
                <h2>Ganancia neta por mes</h2>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <BarChart data={netChart} format={money} />
            </div>
          </section>

          {/* === Historial: pacientes atendidos + nuevos por mes === */}
          <section className="card">
            <div className="form-header">
              <div>
                <p className="eyebrow">Historial mensual</p>
                <h2>Pacientes por mes</h2>
              </div>
            </div>
            <p className="muted" style={{ fontSize: '0.85rem', marginTop: 4 }}>
              Nuevo = valoración (morado) que además tomó sesión.
            </p>
            <div style={{ marginTop: 12 }}>
              <GroupedBarChart
                data={patientsChart}
                seriesA={{ label: 'Atendidos', color: '#2980b9' }}
                seriesB={{ label: 'Nuevos', color: 'var(--valoracion)' }}
              />
            </div>
          </section>

          {/* === Historial detallado mes con mes (tabla + descarga CSV) === */}
          <MonthlyHistory monthly={summary?.monthly ?? []} />

          {/* === Top pacientes por ingreso === */}
          <section className="card">
            <div className="form-header">
              <div>
                <p className="eyebrow">Todo el tiempo</p>
                <h2>Top pacientes por ingreso</h2>
              </div>
            </div>
            <ul className="list-stack" style={{ marginTop: 12, listStyle: 'none', padding: 0 }}>
              {(summary?.topPatients ?? []).map((t, i) => (
                <li
                  key={t.patientId}
                  className="note-row"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 10
                  }}
                >
                  <button
                    type="button"
                    className="secondary"
                    style={{ textAlign: 'left', flex: 1 }}
                    onClick={() =>
                      setSelectedPatient({ id: t.patientId, full_name: t.fullName } as Patient)
                    }
                  >
                    <span style={{ opacity: 0.6, marginRight: 6 }}>{i + 1}.</span>
                    {t.fullName}
                  </button>
                  <strong style={{ color: 'var(--income)' }}>{money(t.paid)}</strong>
                </li>
              ))}
              {summary && summary.topPatients.length === 0 && (
                <p className="muted">Aún no hay pagos registrados.</p>
              )}
            </ul>
          </section>

          {/* === Gastos por categoría === */}
          {summary && summary.expensesByCategory.length > 0 && (
            <section className="card">
              <div className="form-header">
                <div>
                  <p className="eyebrow">Egresos</p>
                  <h2>Gastos por categoría</h2>
                </div>
              </div>
              <ul className="list-stack" style={{ marginTop: 12, listStyle: 'none', padding: 0 }}>
                {summary.expensesByCategory.map((c) => (
                  <li
                    key={c.category}
                    className="note-row"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 10
                    }}
                  >
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        textTransform: 'capitalize'
                      }}
                    >
                      <span
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 3,
                          background: CATEGORY_COLORS[c.category] ?? CATEGORY_COLORS.otro
                        }}
                      />
                      {c.category}
                    </span>
                    <strong style={{ color: 'var(--expense)' }}>-{money(c.amount)}</strong>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <ExpensesPanel />
        </>
      )}
    </div>
  );
}
