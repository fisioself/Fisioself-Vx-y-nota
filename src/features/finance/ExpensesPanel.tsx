import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { financeApi } from '../../services/financeApi';
import { useToast } from '../../app/ToastProvider';
import { EXPENSE_CATEGORIES, money, today } from './financeUtils';

export function ExpensesPanel() {
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

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: 10,
          marginTop: 12
        }}
      >
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
                {e.description || 'Sin descripción'} · {e.spent_at}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <strong style={{ color: '#c0392b' }}>-{money(Number(e.amount))}</strong>
              <button
                type="button"
                className="secondary"
                onClick={() => remove(e.id)}
                title="Eliminar"
              >
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
