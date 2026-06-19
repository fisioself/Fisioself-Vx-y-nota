import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { financeApi } from '../../services/financeApi';
import { useToast } from '../../app/ToastProvider';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EXPENSE_CATEGORIES, fmtDate, money, today } from './financeUtils';

export function ExpensesPanel() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [category, setCategory] = useState('material');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [spentAt, setSpentAt] = useState(today());
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  // Para el estado vacío accionable: enfocar el campo de monto del formulario.
  const amountRef = useRef<HTMLInputElement>(null);

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
    if (!Number.isFinite(value) || value <= 0) {
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
    setRemoving(true);
    try {
      await financeApi.deleteExpense(id);
      refresh();
    } catch {
      notify({ tone: 'error', message: 'No se pudo eliminar.' });
    } finally {
      setRemoving(false);
      setConfirmId(null);
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

      <div className="finance-form" style={{ marginTop: 12 }}>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Categoría"
        >
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c.charAt(0).toUpperCase() + c.slice(1)}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Descripción (opcional)"
          aria-label="Descripción del gasto"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <input
          ref={amountRef}
          type="number"
          inputMode="decimal"
          min={0}
          placeholder="Monto $"
          aria-label="Monto del gasto"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <input
          type="date"
          value={spentAt}
          max={today()}
          aria-label="Fecha del gasto"
          onChange={(e) => setSpentAt(e.target.value)}
        />
        <button type="button" className="finance-form-full" onClick={submit} disabled={busy}>
          {busy ? 'Guardando…' : 'Agregar gasto'}
        </button>
      </div>

      <ul className="list-stack" style={{ marginTop: 16, listStyle: 'none', padding: 0 }}>
        {expenses.map((e) => (
          <li
            key={e.id}
            className="note-row"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10
            }}
          >
            <div>
              <strong style={{ display: 'block', textTransform: 'capitalize' }}>
                {e.category}
              </strong>
              <span className="muted" style={{ fontSize: '0.85rem' }}>
                {e.description || 'Sin descripción'} · {fmtDate(e.spent_at ?? '')}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <strong style={{ color: 'var(--expense)' }}>-{money(Number(e.amount))}</strong>
              <button
                type="button"
                className="secondary"
                onClick={() => setConfirmId(e.id)}
                disabled={removing && confirmId === e.id}
                aria-label="Eliminar gasto"
                title="Eliminar"
              >
                ✕
              </button>
            </div>
          </li>
        ))}
        {expenses.length === 0 && (
          <div className="empty-cta">
            <p className="muted">Aún no hay gastos registrados.</p>
            <button
              type="button"
              className="secondary"
              onClick={() => amountRef.current?.focus()}
            >
              Registrar el primer gasto
            </button>
          </div>
        )}
      </ul>

      {confirmId && (
        <ConfirmDialog
          title="Eliminar gasto"
          message="¿Eliminar este gasto registrado?"
          confirmLabel="Eliminar"
          busy={removing}
          onConfirm={() => remove(confirmId)}
          onCancel={() => setConfirmId(null)}
        />
      )}
    </section>
  );
}
