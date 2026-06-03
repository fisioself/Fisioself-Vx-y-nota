import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../app/ToastProvider';
import { financeApi } from '../../services/financeApi';
import { ExpensesPanel } from './ExpensesPanel';

vi.mock('../../services/financeApi', () => ({
  financeApi: {
    listExpenses: vi.fn(),
    addExpense: vi.fn(),
    deleteExpense: vi.fn()
  }
}));

const makeWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
};

beforeEach(() => {
  vi.mocked(financeApi.listExpenses).mockResolvedValue([]);
  vi.mocked(financeApi.addExpense).mockResolvedValue({} as never);
  vi.mocked(financeApi.deleteExpense).mockResolvedValue(undefined as never);
});

describe('ExpensesPanel', () => {
  it('renders the panel heading', async () => {
    render(<ExpensesPanel />, { wrapper: makeWrapper() });
    expect(screen.getByText('Gastos del negocio')).toBeInTheDocument();
  });

  it('shows empty state when no expenses exist', async () => {
    render(<ExpensesPanel />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByText(/Aún no hay gastos/)).toBeInTheDocument();
    });
  });

  it('shows existing expenses from the API', async () => {
    vi.mocked(financeApi.listExpenses).mockResolvedValue([
      {
        id: 'exp-1',
        category: 'renta',
        description: 'Consultorio marzo',
        amount: '5000',
        spent_at: '2026-03-01',
        clinic_id: 'clinic-1',
        created_at: '2026-03-01'
      } as never
    ]);
    render(<ExpensesPanel />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByText('renta')).toBeInTheDocument();
      expect(screen.getByText(/Consultorio marzo/)).toBeInTheDocument();
    });
  });

  it('does not call addExpense when amount is empty', async () => {
    render(<ExpensesPanel />, { wrapper: makeWrapper() });
    await userEvent.click(screen.getByRole('button', { name: /Agregar gasto/ }));
    expect(financeApi.addExpense).not.toHaveBeenCalled();
  });

  it('calls addExpense with correct args on submit', async () => {
    render(<ExpensesPanel />, { wrapper: makeWrapper() });
    await userEvent.clear(screen.getByPlaceholderText(/Monto \$/));
    await userEvent.type(screen.getByPlaceholderText(/Monto \$/), '1500');
    await userEvent.type(screen.getByPlaceholderText(/Descripción/), 'Luz');
    await userEvent.click(screen.getByRole('button', { name: /Agregar gasto/ }));
    await waitFor(() => {
      expect(financeApi.addExpense).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 1500, description: 'Luz' })
      );
    });
  });

  it('calls deleteExpense when the remove button is clicked', async () => {
    vi.mocked(financeApi.listExpenses).mockResolvedValue([
      {
        id: 'exp-2',
        category: 'nomina',
        description: null,
        amount: '8000',
        spent_at: '2026-03-15',
        clinic_id: 'clinic-1',
        created_at: '2026-03-15'
      } as never
    ]);
    render(<ExpensesPanel />, { wrapper: makeWrapper() });
    const deleteBtn = await screen.findByTitle('Eliminar');
    await userEvent.click(deleteBtn);
    await waitFor(() => {
      expect(financeApi.deleteExpense).toHaveBeenCalledWith('exp-2');
    });
  });
});
