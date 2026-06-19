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
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { PaymentMethodSelect } from './PaymentMethodSelect';
import { fmtDate, methodLabel, money, netAfterCommission, today } from './financeUtils';

type CajaEntry = {
  id: string;
  kind: 'payment' | 'movement';
  label: string;
  sublabel: string;
  method: string;
  // Fecha que se MUESTRA (la que el usuario eligió para el movimiento/cobro).
  date: string;
  // Fecha/hora de CAPTURA (created_at). Es la que define el orden del historial:
  // el último registrado va arriba, sin importar la fecha que se le haya puesto.
  createdAt: string;
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
  // Signo del ajuste: ingreso suma (+), gasto resta (−). Se elige con un par de
  // botones en vez de pedir que el monto se escriba en negativo (más cómodo).
  const [sign, setSign] = useState<'in' | 'out'>('in');
  const [method, setMethod] = useState('efectivo');
  const [description, setDescription] = useState('');
  const [occurredAt, setOccurredAt] = useState(today());
  const [busy, setBusy] = useState(false);
  // El historial muestra solo los últimos 4 movimientos por defecto; el resto
  // se despliega bajo demanda para no llenar la pantalla con decenas de filas.
  const [showAllHistory, setShowAllHistory] = useState(false);
  // Confirmación + guarda contra doble-clic al eliminar (borra dinero de caja).
  const [confirmEntry, setConfirmEntry] = useState<CajaEntry | null>(null);
  const [removing, setRemoving] = useState(false);

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
    ...payments.map((p) => {
      const gross = Number(p.amount);
      // En el historial de caja mostramos lo que realmente entró al banco:
      // para tarjeta es el neto (descontando la comisión de terminal).
      const displayAmt = p.method === 'tarjeta' ? netAfterCommission(gross) : gross;
      return {
        id: p.id,
        kind: 'payment' as const,
        label: patientName(p),
        sublabel: sessionTypeOf(p) ?? 'Cobro',
        method: p.method,
        date: p.paid_at,
        createdAt: p.created_at ?? p.paid_at,
        amount: displayAmt,
        raw: p
      };
    }),
    ...movements.map((m) => ({
      id: m.id,
      kind: 'movement' as const,
      label: m.description || (Number(m.amount) >= 0 ? 'Entrada manual' : 'Salida manual'),
      sublabel: '',
      method: m.method,
      date: m.occurred_at,
      createdAt: m.created_at ?? m.occurred_at,
      amount: Number(m.amount),
      raw: m
    }))
  ].sort((a, b) => {
    // Orden por captura real (created_at): el último registrado arriba. Así un
    // movimiento que se registra hoy pero se fecha en un día pasado igual aparece
    // al principio, en el orden en que realmente se fue capturando.
    const ka = sortKey(a.createdAt);
    const kb = sortKey(b.createdAt);
    return ka < kb ? 1 : ka > kb ? -1 : 0;
  });

  const HISTORY_PREVIEW = 4;
  const visibleEntries = showAllHistory ? entries : entries.slice(0, HISTORY_PREVIEW);

  const submit = async () => {
    const value = Math.abs(Number(amount));
    if (!value) {
      notify({
        tone: 'error',
        message: 'Indica un monto válido y elige Ingreso o Gasto.'
      });
      return;
    }
    // El botón Ingreso/Gasto define el signo; el monto siempre se escribe positivo.
    const signed = sign === 'out' ? -value : value;
    setBusy(true);
    try {
      await financeApi.addCajaMovement({
        amount: signed,
        method: method as PaymentMethod,
        description,
        occurredAt
      });
      setAmount('');
      setSign('in');
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
    setRemoving(true);
    try {
      if (entry.kind === 'movement') {
        await financeApi.deleteCajaMovement(entry.id);
      } else {
        await financeApi.deleteAppointmentCharge(entry.raw as Payment);
      }
      refresh();
    } catch {
      notify({ tone: 'error', message: 'No se pudo eliminar.' });
    } finally {
      setRemoving(false);
      setConfirmEntry(null);
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
          <strong style={{ color: 'var(--income)' }}>{money(caja?.total ?? 0)}</strong>
        </div>
      </div>

      {/* Ajuste manual de caja */}
      <div style={{ marginTop: 16 }}>
        <p className="eyebrow">Ajustar caja manualmente</p>
        <div style={{ display: 'grid', gap: 10 }}>
          {/* Selector de signo: más cómodo que escribir el monto en negativo. */}
          <div role="group" aria-label="Tipo de movimiento" style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => setSign('in')}
              aria-pressed={sign === 'in'}
              className={sign === 'in' ? '' : 'secondary'}
              style={{
                flex: 1,
                ...(sign === 'in'
                  ? { background: 'var(--income)', borderColor: 'var(--income)' }
                  : {})
              }}
            >
              + Ingreso
            </button>
            <button
              type="button"
              onClick={() => setSign('out')}
              aria-pressed={sign === 'out'}
              className={sign === 'out' ? '' : 'secondary'}
              style={{
                flex: 1,
                ...(sign === 'out'
                  ? { background: 'var(--expense)', borderColor: 'var(--expense)' }
                  : {})
              }}
            >
              − Gasto
            </button>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              placeholder="Monto"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{ flex: '1 1 140px', minWidth: 0 }}
            />
            <PaymentMethodSelect
              value={method}
              onChange={setMethod}
              ariaLabel="Método"
              style={{ flex: '1 1 130px', minWidth: 0 }}
            />
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
              max={today()}
              aria-label="Fecha del movimiento"
              onChange={(e) => setOccurredAt(e.target.value)}
              style={{ flex: '1 1 140px', minWidth: 0 }}
            />
          </div>
          <button type="button" onClick={submit} disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Guardando…' : sign === 'out' ? 'Registrar gasto' : 'Registrar ingreso'}
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
        {visibleEntries.map((e) => {
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
                <strong
                  style={{
                    color: positive ? 'var(--income)' : 'var(--expense)',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {positive ? '+' : '−'}
                  {money(Math.abs(e.amount))}
                </strong>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setConfirmEntry(e)}
                  disabled={removing && confirmEntry?.id === e.id}
                  aria-label="Eliminar movimiento"
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

      {entries.length > HISTORY_PREVIEW && (
        <button
          type="button"
          className="secondary"
          onClick={() => setShowAllHistory((v) => !v)}
          aria-expanded={showAllHistory}
          style={{ width: '100%', marginTop: 10 }}
        >
          {showAllHistory ? 'Ver menos' : `Ver historial completo (${entries.length} movimientos)`}
        </button>
      )}

      {confirmEntry && (
        <ConfirmDialog
          title="Eliminar movimiento"
          message={
            confirmEntry.kind === 'payment'
              ? '¿Eliminar este cobro? Se borrará el pago del paciente y su comisión asociada.'
              : '¿Eliminar este ajuste manual de caja?'
          }
          confirmLabel="Eliminar"
          busy={removing}
          onConfirm={() => remove(confirmEntry)}
          onCancel={() => setConfirmEntry(null)}
        />
      )}
    </section>
  );
}
