import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  financeApi,
  type CajaMovement,
  type Payment,
  type PaymentMethod,
  type PaymentWithPatient
} from '../../services/financeApi';
import { useToast } from '../../app/ToastProvider';
import { fmtDate, methodLabel, money, today } from './financeUtils';

type CajaEntry = {
  id: string;
  kind: 'payment' | 'movement';
  label: string;
  sublabel: string;
  method: string;
  date: string;
  amount: number;
  raw: PaymentWithPatient | CajaMovement;
};

interface CajaPanelProps {
  caja?: { total: number; byMethod: Record<string, number> };
}

export function CajaPanel({ caja }: CajaPanelProps) {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('efectivo');
  const [description, setDescription] = useState('');
  const [occurredAt, setOccurredAt] = useState(today());
  const [busy, setBusy] = useState(false);

  const { data: movements = [] } = useQuery({
    queryKey: ['caja-movements'],
    queryFn: () => financeApi.listCajaMovements()
  });

  const { data: payments = [] } = useQuery({
    queryKey: ['caja-payments'],
    queryFn: () => financeApi.listRecentPayments()
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['caja-movements'] });
    queryClient.invalidateQueries({ queryKey: ['caja-payments'] });
    queryClient.invalidateQueries({ queryKey: ['finance-global'] });
    queryClient.invalidateQueries({ queryKey: ['patient-finance'] });
  };

  const patientName = (p: (typeof payments)[number]): string => {
    const rel = p.patients;
    const obj = Array.isArray(rel) ? rel[0] : rel;
    return obj?.full_name || 'Paciente';
  };

  const sessionTypeOf = (p: (typeof payments)[number]): string | null => {
    const appt = p.appointments;
    if (!appt || Array.isArray(appt)) return null;
    return appt.session_type ?? null;
  };

  // Normaliza a ISO datetime para ordenar: los movimientos usan sólo fecha
  // ("YYYY-MM-DD") y al comparar contra timestamps de pagos quedan por debajo
  // del mismo día. Al hacer flotar la fecha al final del día quedan primero.
  const sortKey = (date: string) => (date.includes('T') ? date : date + 'T23:59:59');

  const entries: CajaEntry[] = [
    ...payments.map((p) => ({
      id: p.id,
      kind: 'payment' as const,
      label: patientName(p),
      sublabel: sessionTypeOf(p) ?? 'Cobro',
      method: p.method,
      date: p.paid_at,
      amount: Number(p.amount),
      raw: p
    })),
    ...movements.map((m) => ({
      id: m.id,
      kind: 'movement' as const,
      label: m.description || (Number(m.amount) >= 0 ? 'Entrada manual' : 'Salida manual'),
      sublabel: '',
      method: m.method,
      date: m.occurred_at,
      amount: Number(m.amount),
      raw: m
    }))
  ].sort((a, b) => {
    const ka = sortKey(a.date);
    const kb = sortKey(b.date);
    return ka < kb ? 1 : ka > kb ? -1 : 0;
  });

  const submit = async () => {
    const value = Number(amount);
    if (!value) {
      notify({
        tone: 'error',
        message: 'Indica un monto válido (positivo = ingreso, negativo = gasto).'
      });
      return;
    }
    setBusy(true);
    try {
      await financeApi.addCajaMovement({
        amount: value,
        method: method as PaymentMethod,
        description,
        occurredAt
      });
      setAmount('');
      setDescription('');
      refresh();
      notify({ tone: 'success', message: 'Movimiento registrado.' });
    } catch {
      notify({ tone: 'error', message: 'No se pudo registrar el movimiento.' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (entry: CajaEntry) => {
    try {
      if (entry.kind === 'movement') {
        await financeApi.deleteCajaMovement(entry.id);
      } else {
        await financeApi.deleteAppointmentCharge(entry.raw as Payment);
      }
      refresh();
    } catch {
      notify({ tone: 'error', message: 'No se pudo eliminar.' });
    }
  };

  return (
    <section className="card">
      <div className="form-header">
        <div>
          <p className="eyebrow">Acumulado de todo el tiempo</p>
          <h2>¿Cuánto hay en caja?</h2>
        </div>
      </div>
      <div
        className="summary-grid"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', marginTop: 12 }}
      >
        <div className="card" style={{ background: 'var(--bg-sunken)' }}>
          <span>Efectivo</span>
          <strong>{money(caja?.byMethod?.efectivo ?? 0)}</strong>
        </div>
        <div className="card" style={{ background: 'var(--bg-sunken)' }}>
          <span>Tarjeta / Transferencia</span>
          <strong>{money(caja?.byMethod?.tarjeta ?? 0)}</strong>
        </div>
        <div className="card">
          <span>Total en caja</span>
          <strong style={{ color: '#1f9d57' }}>{money(caja?.total ?? 0)}</strong>
        </div>
      </div>

      {/* Ajuste manual de caja */}
      <div style={{ marginTop: 16 }}>
        <p className="eyebrow">Ajustar caja manualmente</p>
        <p className="muted" style={{ fontSize: '0.82rem', marginTop: 2, marginBottom: 8 }}>
          Positivo (+) = ingreso · Negativo (−) = gasto
        </p>
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              type="number"
              inputMode="decimal"
              placeholder="Monto (+ingreso / −gasto)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{ flex: '1 1 140px', minWidth: 0 }}
            />
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              aria-label="Método"
              style={{ flex: '1 1 130px', minWidth: 0 }}
            >
              <option value="efectivo">Efectivo</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="transferencia">Transferencia</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Concepto (opcional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ flex: '2 1 180px', minWidth: 0 }}
            />
            <input
              type="date"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              style={{ flex: '1 1 140px', minWidth: 0 }}
            />
          </div>
          <button type="button" onClick={submit} disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Guardando…' : 'Registrar movimiento'}
          </button>
        </div>
      </div>

      {/* Historial: cobros de pacientes + ajustes manuales */}
      <div
        style={{ marginTop: 12, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <p className="eyebrow" style={{ margin: 0 }}>
          Historial
        </p>
        <span className="muted" style={{ fontSize: '0.8rem' }}>
          ({entries.length} movimientos)
        </span>
      </div>
      <ul className="list-stack" style={{ marginTop: 8, listStyle: 'none', padding: 0 }}>
        {entries.map((e) => {
          const positive = e.amount >= 0;
          return (
            <li
              key={`${e.kind}-${e.id}`}
              className="note-row"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 10
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <strong
                  style={{
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {e.label}
                </strong>
                <span className="muted" style={{ fontSize: '0.8rem' }}>
                  {e.sublabel && (
                    <span
                      className="pill"
                      style={{ marginRight: 6, fontSize: '0.7rem', textTransform: 'none' }}
                    >
                      {e.sublabel}
                    </span>
                  )}
                  {methodLabel(e.method)} · {fmtDate(e.date)}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <strong style={{ color: positive ? '#1f9d57' : '#c0392b', whiteSpace: 'nowrap' }}>
                  {positive ? '+' : '−'}
                  {money(Math.abs(e.amount))}
                </strong>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => remove(e)}
                  title="Eliminar"
                >
                  ✕
                </button>
              </div>
            </li>
          );
        })}
        {entries.length === 0 && <p className="muted">Aún no hay cobros ni ajustes de caja.</p>}
      </ul>
    </section>
  );
}
