import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../app/ToastProvider';
import { financeApi } from '../../services/financeApi';
import type { Patient } from '../../types/clinical';
import { PatientFinancePanel } from './PatientFinancePanel';

vi.mock('../../services/financeApi', () => ({
  financeApi: {
    listPackages: vi.fn(),
    getPatientFinance: vi.fn(),
    addPatientPackage: vi.fn(),
    addPayment: vi.fn(),
    setSessionsUsed: vi.fn(),
    deletePatientPackage: vi.fn()
  }
}));

const PATIENT: Patient = { id: 'patient-1', full_name: 'Ana García' } as Patient;

const FINANCE_SUMMARY = {
  totalBilled: 3000,
  totalPaid: 1500,
  balance: 1500,
  sessionsTotal: 10,
  sessionsUsed: 3,
  sessionsRemaining: 7,
  packages: [
    {
      id: 'pkg-1',
      name: 'Paquete 10 sesiones',
      total_amount: '3000',
      sessions_total: 10,
      sessions_used: 3,
      purchased_at: '2026-05-01'
    }
  ],
  payments: []
};

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
  vi.mocked(financeApi.listPackages).mockResolvedValue([]);
  vi.mocked(financeApi.getPatientFinance).mockResolvedValue(FINANCE_SUMMARY as never);
  vi.mocked(financeApi.addPatientPackage).mockResolvedValue({ id: 'new-pkg' } as never);
  vi.mocked(financeApi.addPayment).mockResolvedValue({} as never);
  vi.mocked(financeApi.setSessionsUsed).mockResolvedValue({} as never);
  vi.mocked(financeApi.deletePatientPackage).mockResolvedValue(undefined as never);
});

describe('PatientFinancePanel', () => {
  it('shows the patient name as the heading', () => {
    render(<PatientFinancePanel patient={PATIENT} />, { wrapper: makeWrapper() });
    expect(screen.getByRole('heading', { name: 'Ana García' })).toBeInTheDocument();
  });

  it('displays the finance summary after loading', async () => {
    render(<PatientFinancePanel patient={PATIENT} />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByText('Saldo')).toBeInTheDocument();
    });
    // Sesiones restantes 7/10
    expect(screen.getByText('7 / 10')).toBeInTheDocument();
  });

  it('lists existing packages', async () => {
    render(<PatientFinancePanel patient={PATIENT} />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByText('Paquete 10 sesiones')).toBeInTheDocument();
    });
  });

  it('does not call addPatientPackage when no package is selected', async () => {
    render(<PatientFinancePanel patient={PATIENT} />, { wrapper: makeWrapper() });
    await userEvent.click(screen.getByRole('button', { name: /Agregar/ }));
    expect(financeApi.addPatientPackage).not.toHaveBeenCalled();
  });

  it('does not call addPayment when abono amount is 0', async () => {
    render(<PatientFinancePanel patient={PATIENT} />, { wrapper: makeWrapper() });
    await userEvent.click(screen.getByRole('button', { name: /Registrar abono/ }));
    expect(financeApi.addPayment).not.toHaveBeenCalled();
  });

  it('applies card commission when method is tarjeta', async () => {
    render(<PatientFinancePanel patient={PATIENT} />, { wrapper: makeWrapper() });
    const abonoInput = screen.getByPlaceholderText(/Abono \$/);
    await userEvent.type(abonoInput, '1000');
    const methodSelect = screen.getByRole('combobox', { name: /método de abono/i });
    await userEvent.selectOptions(methodSelect, 'tarjeta');
    // Commission hint should appear
    await waitFor(() => {
      expect(screen.getByText(/comisión/)).toBeInTheDocument();
    });
  });

  it('calls addPayment with cash amount when method is efectivo', async () => {
    render(<PatientFinancePanel patient={PATIENT} />, { wrapper: makeWrapper() });
    const abonoInput = screen.getByPlaceholderText(/Abono \$/);
    await userEvent.type(abonoInput, '500');
    await userEvent.click(screen.getByRole('button', { name: /Registrar abono/ }));
    await waitFor(() => {
      expect(financeApi.addPayment).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 500, patientId: 'patient-1' })
      );
    });
  });
});
