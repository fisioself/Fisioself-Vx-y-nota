import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../app/ToastProvider';
import { financeApi } from '../../services/financeApi';
import { CajaPanel } from './CajaPanel';

vi.mock('../../services/financeApi', () => ({
  financeApi: {
    listCajaMovements: vi.fn(),
    listRecentPayments: vi.fn(),
    addCajaMovement: vi.fn(),
    deleteCajaMovement: vi.fn(),
    deleteAppointmentCharge: vi.fn()
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

const CAJA = {
  total: 25000,
  byMethod: { efectivo: 10000, tarjeta: 15000 }
};

beforeEach(() => {
  vi.mocked(financeApi.listCajaMovements).mockResolvedValue([]);
  vi.mocked(financeApi.listRecentPayments).mockResolvedValue([]);
  vi.mocked(financeApi.addCajaMovement).mockResolvedValue({} as never);
  vi.mocked(financeApi.deleteCajaMovement).mockResolvedValue(undefined as never);
  vi.mocked(financeApi.deleteAppointmentCharge).mockResolvedValue(undefined as never);
});

describe('CajaPanel', () => {
  it('renders cash totals from the caja prop', () => {
    render(<CajaPanel caja={CAJA} />, { wrapper: makeWrapper() });
    expect(screen.getByText('Tarjeta / Transferencia')).toBeInTheDocument();
    expect(screen.getByText('Total en caja')).toBeInTheDocument();
  });

  it('shows zero totals when no caja prop is provided', () => {
    render(<CajaPanel />, { wrapper: makeWrapper() });
    expect(screen.getByText('Total en caja')).toBeInTheDocument();
  });

  it('shows the empty history message when no entries exist', async () => {
    render(<CajaPanel caja={CAJA} />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByText(/Aún no hay cobros/)).toBeInTheDocument();
    });
  });

  it('does not call addCajaMovement when amount is empty', async () => {
    render(<CajaPanel caja={CAJA} />, { wrapper: makeWrapper() });
    await userEvent.click(screen.getByRole('button', { name: /Registrar movimiento/ }));
    expect(financeApi.addCajaMovement).not.toHaveBeenCalled();
  });

  it('calls addCajaMovement with positive amount (ingreso)', async () => {
    render(<CajaPanel caja={CAJA} />, { wrapper: makeWrapper() });
    await userEvent.type(screen.getByPlaceholderText(/Monto/), '2000');
    await userEvent.click(screen.getByRole('button', { name: /Registrar movimiento/ }));
    await waitFor(() => {
      expect(financeApi.addCajaMovement).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 2000 })
      );
    });
  });

  it('calls addCajaMovement with negative amount (gasto)', async () => {
    render(<CajaPanel caja={CAJA} />, { wrapper: makeWrapper() });
    await userEvent.type(screen.getByPlaceholderText(/Monto/), '-500');
    await userEvent.click(screen.getByRole('button', { name: /Registrar movimiento/ }));
    await waitFor(() => {
      expect(financeApi.addCajaMovement).toHaveBeenCalledWith(
        expect.objectContaining({ amount: -500 })
      );
    });
  });

  it('calls deleteCajaMovement when removing a manual movement', async () => {
    vi.mocked(financeApi.listCajaMovements).mockResolvedValue([
      {
        id: 'mov-1',
        description: 'Retiro caja',
        amount: '-1000',
        method: 'efectivo',
        occurred_at: '2026-06-01',
        clinic_id: 'clinic-1',
        created_at: '2026-06-01'
      } as never
    ]);
    render(<CajaPanel caja={CAJA} />, { wrapper: makeWrapper() });
    const deleteBtn = await screen.findByTitle('Eliminar');
    await userEvent.click(deleteBtn);
    await waitFor(() => {
      expect(financeApi.deleteCajaMovement).toHaveBeenCalledWith('mov-1');
    });
  });
});
