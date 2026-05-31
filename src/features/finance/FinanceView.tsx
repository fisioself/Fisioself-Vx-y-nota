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
// Gráfica de barras ligera (sin dependencias): ingresos vs gastos
// ------------------------------------------------------------------
function MonthlyChart({ data }: { data: Array<{ month: string; income: number; expenses: number }> }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.income, d.expenses)));
  return (
    <div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: '0.85rem' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: '#1f9d57' }} /> Ingresos
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: '#e05656' }} /> Gastos
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 8,
          height: 160,
          overflowX: 'auto',
          paddingBottom: 4
        }}
      >
        {data.map((d) => (
          <div
            key={d.month}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 38, flex: 1 }}
            title={`${monthLabel(d.month)}: ingresos ${money(d.income)} · gastos ${money(d.expenses)}`}
          >
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 130 }}>
              <div
                style={{
                  width: 12,
                  height: `${(d.income / max) * 100}%`,
                  background: '#1f9d57',
                  borderRadius: '3px 3px 0 0',
                  minHeight: d.income > 0 ? 3 : 0
                }}
              />
              <div
                style={{
                  width: 12,
                  height: `${(d.expenses / max) * 100}%`,
                  background: '#e05656',
                  borderRadius: '3px 3px 0 0',
                  minHeight: d.expenses > 0 ? 3 : 0
                }}
              />
            </div>
            <span className="muted" style={{ fontSize: '0.7rem', marginTop: 4 }}>
              {monthLabel(d.month)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

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

  const kpis = useMemo(
    () => [
      { label: 'Ingresos (12m)', value: summary?.totalIncome ?? 0, color: '#1f9d57' },
      { label: 'Gastos (12m)', value: summary?.totalExpenses ?? 0, color: '#c0392b' },
      { label: 'Ganancia neta', value: summary?.net ?? 0, color: (summary?.net ?? 0) >= 0 ? '#1f9d57' : '#c0392b' },
      { label: 'Por cobrar', value: summary?.pendingReceivables ?? 0, color: '#b9770e' }
    ],
    [summary]
  );

  return (
    <div className="record-stack">
      <header className="hero" style={{ padding: 24, borderRadius: 22 }}>
        <p className="eyebrow" style={{ color: 'rgba(255,255,255,0.7)' }}>
          Control financiero
        </p>
        <h1 style={{ fontSize: 30, color: 'white', margin: 0 }}>Finanzas</h1>
      </header>

      {isLoading ? (
        <section className="card" aria-busy="true">
          Cargando finanzas…
        </section>
      ) : (
        <>
          <div className="summary-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            {kpis.map((k) => (
              <div className="card" key={k.label}>
                <span>{k.label}</span>
                <strong style={{ color: k.color }}>{money(k.value)}</strong>
              </div>
            ))}
          </div>

          <section className="card">
            <div className="form-header">
              <div>
                <p className="eyebrow">Últimos 12 meses</p>
                <h2>Ingresos vs Gastos</h2>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <MonthlyChart data={summary?.monthly ?? []} />
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

          {/* Cuentas por cobrar */}
          <section className="card">
            <div className="form-header">
              <div>
                <p className="eyebrow">Pendientes</p>
                <h2>Cuentas por cobrar</h2>
              </div>
            </div>
            <ul className="list-stack" style={{ marginTop: 12, listStyle: 'none', padding: 0 }}>
              {(summary?.receivables ?? []).map((r) => (
                <li
                  key={r.patientId}
                  className="note-row"
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}
                >
                  <button
                    type="button"
                    className="secondary"
                    style={{ textAlign: 'left', flex: 1 }}
                    onClick={() =>
                      setSelectedPatient({ id: r.patientId, full_name: r.fullName } as Patient)
                    }
                  >
                    {r.fullName}
                    <span className="muted" style={{ display: 'block', fontSize: '0.8rem' }}>
                      Pagó {money(r.paid)} de {money(r.billed)}
                    </span>
                  </button>
                  <strong style={{ color: '#c0392b' }}>{money(r.balance)}</strong>
                </li>
              ))}
              {summary && summary.receivables.length === 0 && (
                <p className="muted">No hay saldos pendientes. 🎉</p>
              )}
            </ul>
          </section>

          <ExpensesPanel />
        </>
      )}
    </div>
  );
}
