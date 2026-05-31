import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { financeApi } from '../../services/financeApi';
import { clinicalApi } from '../../services/clinicalApi';
import { useToast } from '../../app/ToastProvider';
import type { Patient } from '../../types/clinical';

const money = (n: number) =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0
  }).format(Number.isFinite(n) ? n : 0);

const MONTH_ABBR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const monthLabel = (ym: string) => {
  const [, m] = ym.split('-');
  return MONTH_ABBR[Number(m) - 1] ?? ym;
};

const today = () => new Date().toISOString().slice(0, 10);

// ------------------------------------------------------------------
// Gráfica de barras ligera (sin dependencias). Una serie por mes.
// Soporta valores negativos con línea base al centro (útil para neto).
// ------------------------------------------------------------------
function BarChart({
  data,
  format,
  positiveColor = '#1f9d57',
  negativeColor = '#c0392b'
}: {
  data: Array<{ month: string; value: number }>;
  format: (n: number) => string;
  positiveColor?: string;
  negativeColor?: string;
}) {
  const maxAbs = Math.max(1, ...data.map((d) => Math.abs(d.value)));
  const hasNeg = data.some((d) => d.value < 0);
  const H = 130;
  const zeroBand = hasNeg ? H / 2 : H; // alto disponible hacia arriba

  if (data.length === 0) {
    return <p className="muted">Aún no hay datos para graficar.</p>;
  }

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
      {data.map((d) => {
        const pos = d.value >= 0;
        const h = (Math.abs(d.value) / maxAbs) * zeroBand;
        return (
          <div
            key={d.month}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 34, flex: 1 }}
            title={`${monthLabel(d.month)}: ${format(d.value)}`}
          >
            <div style={{ position: 'relative', height: H, width: 16, display: 'flex', flexDirection: 'column' }}>
              {/* zona superior (positivos) */}
              <div style={{ flex: hasNeg ? 1 : 'none', height: hasNeg ? undefined : H, display: 'flex', alignItems: 'flex-end' }}>
                {pos && (
                  <div
                    style={{
                      width: '100%',
                      height: h,
                      background: positiveColor,
                      borderRadius: '3px 3px 0 0',
                      minHeight: d.value > 0 ? 3 : 0
                    }}
                  />
                )}
              </div>
              {/* zona inferior (negativos) */}
              {hasNeg && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start' }}>
                  {!pos && (
                    <div
                      style={{
                        width: '100%',
                        height: h,
                        background: negativeColor,
                        borderRadius: '0 0 3px 3px',
                        minHeight: d.value < 0 ? 3 : 0
                      }}
                    />
                  )}
                </div>
              )}
            </div>
            <span className="muted" style={{ fontSize: '0.7rem', marginTop: 4 }}>
              {monthLabel(d.month)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Insignia de crecimiento (% vs mes anterior)
function GrowthBadge({ value }: { value: number | null }) {
  if (value === null) return null;
  const up = value >= 0;
  return (
    <span style={{ color: up ? '#1f9d57' : '#c0392b', fontSize: '0.8rem', fontWeight: 600 }}>
      {up ? '▲' : '▼'} {Math.abs(value).toFixed(0)}% vs mes pasado
    </span>
  );
}

const CATEGORY_COLORS: Record<string, string> = {
  renta: '#8e44ad',
  material: '#2980b9',
  servicios: '#16a085',
  nomina: '#d35400',
  otro: '#7f8c8d'
};

// ------------------------------------------------------------------
// Gastos: alta + lista
// ------------------------------------------------------------------
const EXPENSE_CATEGORIES = ['renta', 'material', 'servicios', 'nomina', 'otro'];

function ExpensesPanel() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [category, setCategory] = useState('material');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [spentAt, setSpentAt] = useState(today());
  const [busy, setBusy] = useState(false);

  const { data: expenses = [] } = useQuery({
    queryKey: ['expenses'],
    queryFn: () => financeApi.listExpenses()
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['expenses'] });
    queryClient.invalidateQueries({ queryKey: ['finance-global'] });
  };

  const submit = async () => {
    const value = Number(amount);
    if (!value || value <= 0) {
      notify({ tone: 'error', message: 'Indica un monto válido.' });
      return;
    }
    setBusy(true);
    try {
      await financeApi.addExpense({ category, description, amount: value, spentAt });
      setDescription('');
      setAmount('');
      refresh();
      notify({ tone: 'success', message: 'Gasto registrado.' });
    } catch {
      notify({ tone: 'error', message: 'No se pudo registrar el gasto.' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await financeApi.deleteExpense(id);
      refresh();
    } catch {
      notify({ tone: 'error', message: 'No se pudo eliminar.' });
    }
  };

  return (
    <section className="card">
      <div className="form-header">
        <div>
          <p className="eyebrow">Egresos</p>
          <h2>Gastos del negocio</h2>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginTop: 12 }}>
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Categoría">
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c.charAt(0).toUpperCase() + c.slice(1)}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Descripción (opcional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <input
          type="number"
          inputMode="decimal"
          placeholder="Monto $"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <input type="date" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} />
        <button type="button" onClick={submit} disabled={busy}>
          {busy ? 'Guardando…' : 'Agregar gasto'}
        </button>
      </div>

      <ul className="list-stack" style={{ marginTop: 16, listStyle: 'none', padding: 0 }}>
        {expenses.map((e) => (
          <li
            key={e.id}
            className="note-row"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}
          >
            <div>
              <strong style={{ display: 'block', textTransform: 'capitalize' }}>{e.category}</strong>
              <span className="muted" style={{ fontSize: '0.85rem' }}>
                {e.description || 'Sin descripción'} · {e.spent_at}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <strong style={{ color: '#c0392b' }}>-{money(Number(e.amount))}</strong>
              <button type="button" className="secondary" onClick={() => remove(e.id)} title="Eliminar">
                ✕
              </button>
            </div>
          </li>
        ))}
        {expenses.length === 0 && <p className="muted">Aún no hay gastos registrados.</p>}
      </ul>
    </section>
  );
}

// ------------------------------------------------------------------
// Finanzas de UN paciente: paquetes, sesiones y pagos
// ------------------------------------------------------------------
function PatientFinancePanel({ patient }: { patient: Patient }) {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [selectedPkg, setSelectedPkg] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [markPaid, setMarkPaid] = useState(true);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('efectivo');
  const [busy, setBusy] = useState(false);

  const { data: catalog = [] } = useQuery({
    queryKey: ['packages-catalog'],
    queryFn: () => financeApi.listPackages()
  });

  const { data: finance } = useQuery({
    queryKey: ['patient-finance', patient.id],
    queryFn: () => financeApi.getPatientFinance(patient.id!)
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['patient-finance', patient.id] });
    queryClient.invalidateQueries({ queryKey: ['finance-global'] });
  };

  const chosen = catalog.find((c) => c.id === selectedPkg);

  const addPackage = async () => {
    if (!chosen) {
      notify({ tone: 'error', message: 'Selecciona un servicio o paquete.' });
      return;
    }
    const amount = customAmount !== '' ? Number(customAmount) : Number(chosen.price);
    setBusy(true);
    try {
      const created = await financeApi.addPatientPackage({
        patientId: patient.id!,
        packageId: chosen.id,
        name: chosen.name,
        totalAmount: amount,
        sessionsTotal: chosen.sessions_included
      });
      if (markPaid && amount > 0) {
        await financeApi.addPayment({
          patientId: patient.id!,
          patientPackageId: created.id,
          amount,
          method: 'efectivo'
        });
      }
      setSelectedPkg('');
      setCustomAmount('');
      refresh();
      notify({ tone: 'success', message: 'Servicio agregado.' });
    } catch {
      notify({ tone: 'error', message: 'No se pudo agregar el servicio.' });
    } finally {
      setBusy(false);
    }
  };

  const registerPayment = async () => {
    const value = Number(payAmount);
    if (!value || value <= 0) {
      notify({ tone: 'error', message: 'Indica un monto válido.' });
      return;
    }
    setBusy(true);
    try {
      await financeApi.addPayment({ patientId: patient.id!, amount: value, method: payMethod });
      setPayAmount('');
      refresh();
      notify({ tone: 'success', message: 'Pago registrado.' });
    } catch {
      notify({ tone: 'error', message: 'No se pudo registrar el pago.' });
    } finally {
      setBusy(false);
    }
  };

  const adjustSessions = async (id: string, used: number) => {
    try {
      await financeApi.setSessionsUsed(id, used);
      refresh();
    } catch {
      notify({ tone: 'error', message: 'No se pudo actualizar sesiones.' });
    }
  };

  const removePackage = async (id: string) => {
    try {
      await financeApi.deletePatientPackage(id);
      refresh();
    } catch {
      notify({ tone: 'error', message: 'No se pudo eliminar.' });
    }
  };

  return (
    <section className="card" style={{ borderLeft: '4px solid var(--primary)' }}>
      <div className="form-header">
        <div>
          <p className="eyebrow">Finanzas del paciente</p>
          <h2>{patient.full_name}</h2>
        </div>
      </div>

      {finance && (
        <div
          className="summary-grid"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', marginTop: 12 }}
        >
          <div className="card">
            <span>Total</span>
            <strong>{money(finance.totalBilled)}</strong>
          </div>
          <div className="card" style={{ background: 'var(--bg-sunken)' }}>
            <span>Pagado</span>
            <strong style={{ color: '#1f9d57' }}>{money(finance.totalPaid)}</strong>
          </div>
          <div className="card">
            <span>Saldo</span>
            <strong style={{ color: finance.balance > 0 ? '#c0392b' : '#1f9d57' }}>
              {money(finance.balance)}
            </strong>
          </div>
          <div className="card" style={{ background: 'var(--bg-sunken)' }}>
            <span>Sesiones restantes</span>
            <strong>
              {finance.sessionsRemaining} / {finance.sessionsTotal}
            </strong>
          </div>
        </div>
      )}

      {/* Agregar servicio/paquete */}
      <div style={{ marginTop: 16 }}>
        <p className="eyebrow">Agregar servicio o paquete</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginTop: 8 }}>
          <select value={selectedPkg} onChange={(e) => setSelectedPkg(e.target.value)} aria-label="Servicio">
            <option value="">— Elegir —</option>
            {catalog.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({money(Number(c.price))})
              </option>
            ))}
          </select>
          <input
            type="number"
            inputMode="decimal"
            placeholder={chosen ? `Precio ${money(Number(chosen.price))}` : 'Precio'}
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.9rem' }}>
            <input type="checkbox" checked={markPaid} onChange={(e) => setMarkPaid(e.target.checked)} />
            Marcar pagado
          </label>
          <button type="button" onClick={addPackage} disabled={busy}>
            Agregar
          </button>
        </div>
      </div>

      {/* Lista de paquetes con control de sesiones */}
      <ul className="list-stack" style={{ marginTop: 16, listStyle: 'none', padding: 0 }}>
        {(finance?.packages ?? []).map((p) => (
          <li key={p.id} className="note-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div>
              <strong style={{ display: 'block' }}>{p.name}</strong>
              <span className="muted" style={{ fontSize: '0.85rem' }}>
                {money(Number(p.total_amount))} · {p.purchased_at}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {p.sessions_total > 1 && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => adjustSessions(p.id, p.sessions_used - 1)}
                    disabled={p.sessions_used <= 0}
                    title="Quitar sesión usada"
                  >
                    −
                  </button>
                  <span className="pill">
                    {p.sessions_used}/{p.sessions_total}
                  </span>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => adjustSessions(p.id, p.sessions_used + 1)}
                    disabled={p.sessions_used >= p.sessions_total}
                    title="Marcar sesión usada"
                  >
                    +
                  </button>
                </span>
              )}
              <button type="button" className="secondary" onClick={() => removePackage(p.id)} title="Eliminar">
                ✕
              </button>
            </div>
          </li>
        ))}
        {finance && finance.packages.length === 0 && (
          <p className="muted">Sin paquetes ni servicios registrados.</p>
        )}
      </ul>

      {/* Registrar abono suelto */}
      <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="number"
          inputMode="decimal"
          placeholder="Abono $"
          value={payAmount}
          onChange={(e) => setPayAmount(e.target.value)}
          style={{ maxWidth: 120 }}
        />
        <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} style={{ maxWidth: 150 }}>
          <option value="efectivo">Efectivo</option>
          <option value="transferencia">Transferencia</option>
          <option value="tarjeta">Tarjeta</option>
        </select>
        <button type="button" className="secondary" onClick={registerPayment} disabled={busy}>
          Registrar abono
        </button>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------
// Vista principal de Finanzas
// ------------------------------------------------------------------
interface FinanceViewProps {
  onPatientSelect?: (patientId: string) => void;
}

export function FinanceView(_props: FinanceViewProps) {
  const [query, setQuery] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  const { data: summary, isLoading } = useQuery({
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
    () => (summary?.monthly ?? []).map((m) => ({ month: m.month, value: m.patients })),
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
          Cargando finanzas…
        </section>
      ) : (
        <>
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
                <strong style={{ color: '#1f9d57' }}>{money(cm?.income ?? 0)}</strong>
                <GrowthBadge value={summary?.growth.income ?? null} />
              </div>
              <div className="card">
                <span>Gastos</span>
                <strong style={{ color: '#c0392b' }}>{money(cm?.expenses ?? 0)}</strong>
              </div>
              <div className="card">
                <span>Ganancia neta</span>
                <strong style={{ color: (cm?.net ?? 0) >= 0 ? '#1f9d57' : '#c0392b' }}>
                  {money(cm?.net ?? 0)}
                </strong>
              </div>
              <div className="card" style={{ background: 'var(--bg-sunken)' }}>
                <span>Pacientes atendidos</span>
                <strong>{cm?.patients ?? 0}</strong>
                <GrowthBadge value={summary?.growth.patients ?? null} />
              </div>
              <div className="card" style={{ background: 'var(--bg-sunken)' }}>
                <span>Sesiones</span>
                <strong>{cm?.sessions ?? 0}</strong>
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
                <strong style={{ color: '#1f9d57' }}>{money(d30?.income ?? 0)}</strong>
              </div>
              <div className="card">
                <span>Gastos</span>
                <strong style={{ color: '#c0392b' }}>{money(d30?.expenses ?? 0)}</strong>
              </div>
              <div className="card">
                <span>Ganancia neta</span>
                <strong style={{ color: (d30?.net ?? 0) >= 0 ? '#1f9d57' : '#c0392b' }}>
                  {money(d30?.net ?? 0)}
                </strong>
              </div>
              <div className="card" style={{ background: 'var(--bg-sunken)' }}>
                <span>Pacientes atendidos</span>
                <strong>{d30?.patients ?? 0}</strong>
              </div>
              <div className="card" style={{ background: 'var(--bg-sunken)' }}>
                <span>Sesiones</span>
                <strong>{d30?.sessions ?? 0}</strong>
              </div>
            </div>
          </section>

          {/* === Ticket promedio === */}
          <section className="card">
            <div className="form-header">
              <div>
                <p className="eyebrow">Promedios (todo el tiempo)</p>
                <h2>Ticket promedio</h2>
              </div>
            </div>
            <div
              className="summary-grid"
              style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginTop: 12 }}
            >
              <div className="card">
                <span>Por sesión</span>
                <strong>{money(summary?.ticket.perSession ?? 0)}</strong>
              </div>
              <div className="card">
                <span>Por paciente</span>
                <strong>{money(summary?.ticket.perPatient ?? 0)}</strong>
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

          {/* === Historial: pacientes atendidos por mes === */}
          <section className="card">
            <div className="form-header">
              <div>
                <p className="eyebrow">Historial mensual</p>
                <h2>Pacientes atendidos por mes</h2>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <BarChart data={patientsChart} format={(n) => `${n} pac.`} positiveColor="#2980b9" />
            </div>
          </section>

          {/* === Caja (todo el tiempo) === */}
          <section className="card">
            <div className="form-header">
              <div>
                <p className="eyebrow">Acumulado de todo el tiempo</p>
                <h2>¿Cuánto hay en caja?</h2>
              </div>
            </div>
            <div
              className="summary-grid"
              style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', marginTop: 12 }}
            >
              <div className="card">
                <span>Total en caja</span>
                <strong style={{ color: '#1f9d57' }}>{money(caja?.total ?? 0)}</strong>
              </div>
              <div className="card" style={{ background: 'var(--bg-sunken)' }}>
                <span>Efectivo</span>
                <strong>{money(caja?.byMethod?.efectivo ?? 0)}</strong>
              </div>
              <div className="card" style={{ background: 'var(--bg-sunken)' }}>
                <span>Transferencia</span>
                <strong>{money(caja?.byMethod?.transferencia ?? 0)}</strong>
              </div>
              <div className="card" style={{ background: 'var(--bg-sunken)' }}>
                <span>Tarjeta</span>
                <strong>{money(caja?.byMethod?.tarjeta ?? 0)}</strong>
              </div>
            </div>
          </section>

          {/* Buscador de paciente para gestionar sus finanzas */}
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
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}
                >
                  <button
                    type="button"
                    className="secondary"
                    style={{ textAlign: 'left', flex: 1 }}
                    onClick={() => setSelectedPatient({ id: t.patientId, full_name: t.fullName } as Patient)}
                  >
                    <span style={{ opacity: 0.6, marginRight: 6 }}>{i + 1}.</span>
                    {t.fullName}
                  </button>
                  <strong style={{ color: '#1f9d57' }}>{money(t.paid)}</strong>
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
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, textTransform: 'capitalize' }}>
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
                    <strong style={{ color: '#c0392b' }}>-{money(c.amount)}</strong>
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
