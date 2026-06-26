import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../app/ToastProvider';
import { financeApi } from '../../services/financeApi';
import { CajaPanel } from './CajaPanel';

vi.mock('../../services/financeApi', async () => {
  // Conservamos PAYMENT_METHODS real para que PaymentMethodSelect renderice.
  const actual = await vi.importActual<typeof import('../../services/financeApi')>(
    '../../services/financeApi'
  );
  return {
    ...actual,
    financeApi: {
      listCajaMovements: vi.fn(),
      listRecentPayments: vi.fn(),
      addCajaMovement: vi.fn(),
      deleteCajaMovement: vi.fn(),
      deleteAppointmentCharge: vi.fn()
    }
  };
});

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
    await userEvent.click(screen.getByRole('button', { name: /Registrar ingreso/ }));
    expect(financeApi.addCajaMovement).not.toHaveBeenCalled();
  });

  it('calls addCajaMovement with positive amount when Ingreso is selected', async () => {
    render(<CajaPanel caja={CAJA} />, { wrapper: makeWrapper() });
    // Ingreso es el modo por defecto: solo se escribe el monto positivo.
    await userEvent.type(screen.getByPlaceholderText(/Monto/), '2000');
    await userEvent.click(screen.getByRole('button', { name: /Registrar ingreso/ }));
    await waitFor(() => {
      expect(financeApi.addCajaMovement).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 2000 })
      );
    });
  });

  it('calls addCajaMovement with negative amount when Gasto is selected', async () => {
    render(<CajaPanel caja={CAJA} />, { wrapper: makeWrapper() });
    // Se elige "Gasto" con el botón y el monto se escribe positivo: la app lo
    // convierte a negativo automáticamente.
    await userEvent.click(screen.getByRole('button', { name: /− Gasto/ }));
    await userEvent.type(screen.getByPlaceholderText(/Monto/), '500');
    await userEvent.click(screen.getByRole('button', { name: /Registrar gasto/ }));
    await waitFor(() => {
      expect(financeApi.addCajaMovement).toHaveBeenCalledWith(
        expect.objectContaining({ amount: -500 })
      );
    });
  });

  it('shows only the latest 5 movements and paginates on demand', async () => {
    // 7 movimientos con fechas descendentes; el historial muestra solo los 5
    // más recientes y "Ver más" añade el resto de 5 en 5.
    const movements = Array.from({ length: 7 }, (_, i) => ({
      id: `mov-${i}`,
      description: `Movimiento ${i}`,
      amount: '100',
      method: 'efectivo',
      occurred_at: `2026-06-${String(10 - i).padStart(2, '0')}`,
      clinic_id: 'clinic-1',
      created_at: `2026-06-${String(10 - i).padStart(2, '0')}`
    }));
    vi.mocked(financeApi.listCajaMovements).mockResolvedValue(movements as never);

    render(<CajaPanel caja={CAJA} />, { wrapper: makeWrapper() });

    // Los 5 primeros visibles, los 2 más viejos ocultos.
    expect(await screen.findByText('Movimiento 0')).toBeInTheDocument();
    expect(screen.getByText('Movimiento 4')).toBeInTheDocument();
    expect(screen.queryByText('Movimiento 5')).not.toBeInTheDocument();
    expect(screen.queryByText('Movimiento 6')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Ver más/ }));

    // Tras pulsar "Ver más" aparecen los 2 restantes.
    expect(screen.getByText('Movimiento 5')).toBeInTheDocument();
    expect(screen.getByText('Movimiento 6')).toBeInTheDocument();

    // Y se puede colapsar de nuevo.
    await userEvent.click(screen.getByRole('button', { name: /Ver menos/ }));
    expect(screen.queryByText('Movimiento 6')).not.toBeInTheDocument();
  });

  it('does not show the expand button with 5 or fewer movements', async () => {
    const movements = Array.from({ length: 3 }, (_, i) => ({
      id: `mov-${i}`,
      description: `Movimiento ${i}`,
      amount: '100',
      method: 'efectivo',
      occurred_at: `2026-06-0${i + 1}`,
      clinic_id: 'clinic-1',
      created_at: `2026-06-0${i + 1}`
    }));
    vi.mocked(financeApi.listCajaMovements).mockResolvedValue(movements as never);

    render(<CajaPanel caja={CAJA} />, { wrapper: makeWrapper() });

    await screen.findByText('Movimiento 0');
    expect(screen.queryByRole('button', { name: /Ver más/ })).not.toBeInTheDocument();
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
    // El borrado ahora pasa por un diálogo de confirmación.
    await userEvent.click(await screen.findByRole('button', { name: /^Eliminar$/ }));
    await waitFor(() => {
      expect(financeApi.deleteCajaMovement).toHaveBeenCalledWith('mov-1');
    });
  });
});
