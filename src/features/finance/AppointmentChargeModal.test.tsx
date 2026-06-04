import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../app/ToastProvider';
import { financeApi } from '../../services/financeApi';
import { clinicalApi } from '../../services/clinicalApi';
import { AppointmentChargeModal, type ChargeAppointmentTarget } from './AppointmentChargeModal';

vi.mock('../../services/financeApi', async () => {
  const actual = await vi.importActual<typeof import('../../services/financeApi')>(
    '../../services/financeApi'
  );
  return {
    // Conservamos PAYMENT_METHODS reales para que los <select> rendericen.
    ...actual,
    financeApi: {
      getAppointmentCharge: vi.fn(),
      listActivePatientPackages: vi.fn(),
      suggestPriceForSessionType: vi.fn(),
      getPatientSessionCount: vi.fn(),
      listPackages: vi.fn(),
      getPatientFinance: vi.fn(),
      getPackageSessionPosition: vi.fn(),
      syncPackageSessionsUsed: vi.fn(),
      chargeAppointment: vi.fn(),
      deleteAppointmentCharge: vi.fn(),
      deletePatientPackageFully: vi.fn(),
      addPatientPackage: vi.fn(),
      addPayment: vi.fn()
    }
  };
});

vi.mock('../../services/clinicalApi', () => ({
  clinicalApi: {
    getNextSessionNumber: vi.fn(),
    addSessionNote: vi.fn(),
    deleteAppointmentFully: vi.fn()
  }
}));

const APPOINTMENT: ChargeAppointmentTarget = {
  id: 'appt-1',
  patientId: 'patient-1',
  patientName: 'Ana García',
  sessionType: 'Fisioterapia',
  startsAt: '2026-06-01T16:00:00.000Z',
  colorId: '5'
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
  vi.mocked(financeApi.getAppointmentCharge).mockResolvedValue([]);
  vi.mocked(financeApi.listActivePatientPackages).mockResolvedValue([]);
  vi.mocked(financeApi.suggestPriceForSessionType).mockResolvedValue(null as never);
  vi.mocked(financeApi.getPatientSessionCount).mockResolvedValue(3 as never);
  vi.mocked(financeApi.listPackages).mockResolvedValue([]);
  vi.mocked(financeApi.getPatientFinance).mockResolvedValue({
    packages: [],
    payments: []
  } as never);
  vi.mocked(financeApi.getPackageSessionPosition).mockResolvedValue(0 as never);
  vi.mocked(financeApi.syncPackageSessionsUsed).mockResolvedValue(undefined as never);
  vi.mocked(financeApi.chargeAppointment).mockResolvedValue({ id: 'pay-new' } as never);
  vi.mocked(financeApi.deleteAppointmentCharge).mockResolvedValue(undefined as never);
  vi.mocked(clinicalApi.getNextSessionNumber).mockResolvedValue(1 as never);
});

describe('AppointmentChargeModal', () => {
  it('no renderiza el diálogo si no hay cita', () => {
    render(<AppointmentChargeModal appointment={null} onClose={vi.fn()} />, {
      wrapper: makeWrapper()
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('muestra el nombre del paciente y el tipo de sesión', () => {
    render(<AppointmentChargeModal appointment={APPOINTMENT} onClose={vi.fn()} />, {
      wrapper: makeWrapper()
    });
    expect(screen.getByRole('heading', { name: 'Ana García' })).toBeInTheDocument();
    expect(screen.getByText(/Fisioterapia/)).toBeInTheDocument();
  });

  it('marca las valoraciones como VX (no cuentan como sesión)', () => {
    render(
      <AppointmentChargeModal
        appointment={{ ...APPOINTMENT, colorId: '9', sessionType: 'Valoración' }}
        onClose={vi.fn()}
      />,
      { wrapper: makeWrapper() }
    );
    expect(screen.getByText(/VX \(no cuenta como sesión\)/)).toBeInTheDocument();
  });

  it('rechaza un monto de $0 o menor sin llamar a la API', async () => {
    render(<AppointmentChargeModal appointment={APPOINTMENT} onClose={vi.fn()} />, {
      wrapper: makeWrapper()
    });
    // amount queda vacío (Number('') = 0) → debe mostrar error y no cobrar.
    await userEvent.click(screen.getByRole('button', { name: /Registrar cobro/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/mayor a \$0/i);
    expect(financeApi.chargeAppointment).not.toHaveBeenCalled();
  });

  it('cobra una sesión suelta en efectivo con el monto bruto (sin comisión)', async () => {
    const onClose = vi.fn();
    render(<AppointmentChargeModal appointment={APPOINTMENT} onClose={onClose} />, {
      wrapper: makeWrapper()
    });
    await userEvent.type(screen.getByLabelText(/Monto cobrado al paciente/i), '800');
    await userEvent.click(screen.getByRole('button', { name: /Registrar cobro/ }));

    await waitFor(() => {
      expect(financeApi.chargeAppointment).toHaveBeenCalledWith(
        expect.objectContaining({
          appointmentId: 'appt-1',
          patientId: 'patient-1',
          usePackage: false,
          patientPackageId: null,
          amount: 800,
          method: 'efectivo'
        })
      );
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('descuenta la comisión de la terminal (4.06%) al cobrar con tarjeta', async () => {
    render(<AppointmentChargeModal appointment={APPOINTMENT} onClose={vi.fn()} />, {
      wrapper: makeWrapper()
    });
    await userEvent.type(screen.getByLabelText(/Monto cobrado al paciente/i), '1000');
    await userEvent.selectOptions(screen.getByLabelText(/^Método$/i), 'tarjeta');
    await userEvent.click(screen.getByRole('button', { name: /Registrar cobro/ }));

    // 1000 * (1 - 0.0406) = 959.4 → es el neto que realmente entra a caja.
    await waitFor(() => {
      expect(financeApi.chargeAppointment).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 959.4, method: 'tarjeta', usePackage: false })
      );
    });
  });

  it('deshabilita "Con paquete" cuando el paciente no tiene paquetes activos', () => {
    render(<AppointmentChargeModal appointment={APPOINTMENT} onClose={vi.fn()} />, {
      wrapper: makeWrapper()
    });
    expect(screen.getByRole('button', { name: /Con paquete/ })).toBeDisabled();
  });

  it('cobra contra un paquete (usePackage) sin abono', async () => {
    vi.mocked(financeApi.listActivePatientPackages).mockResolvedValue([
      { id: 'pp-1', name: 'Paquete 10', sessions_total: 10, sessions_used: 2 }
    ] as never);
    const onClose = vi.fn();
    render(<AppointmentChargeModal appointment={APPOINTMENT} onClose={onClose} />, {
      wrapper: makeWrapper()
    });

    const conPaquete = await screen.findByRole('button', { name: /Con paquete/ });
    await waitFor(() => expect(conPaquete).not.toBeDisabled());
    await userEvent.click(conPaquete);
    await userEvent.click(screen.getByRole('button', { name: /Registrar cobro/ }));

    await waitFor(() => {
      expect(financeApi.chargeAppointment).toHaveBeenCalledWith(
        expect.objectContaining({
          usePackage: true,
          patientPackageId: 'pp-1',
          amount: 0,
          method: undefined
        })
      );
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('prefija el monto sugerido para el tipo de sesión', async () => {
    vi.mocked(financeApi.suggestPriceForSessionType).mockResolvedValue(650 as never);
    render(<AppointmentChargeModal appointment={APPOINTMENT} onClose={vi.fn()} />, {
      wrapper: makeWrapper()
    });
    await waitFor(() => {
      expect(screen.getByLabelText(/Monto cobrado al paciente/i)).toHaveValue(650);
    });
  });

  it('muestra el cobro existente y permite deshacerlo', async () => {
    vi.mocked(financeApi.getAppointmentCharge).mockResolvedValue([
      { id: 'pay-1', amount: 500, method: 'efectivo' }
    ] as never);
    render(<AppointmentChargeModal appointment={APPOINTMENT} onClose={vi.fn()} />, {
      wrapper: makeWrapper()
    });

    expect(await screen.findByText(/ya tiene cobro registrado/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Deshacer/ }));

    await waitFor(() => {
      expect(financeApi.deleteAppointmentCharge).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'pay-1' })
      );
    });
    // Estando ya cobrada, no se ofrece el botón de registrar cobro.
    expect(screen.queryByRole('button', { name: /Registrar cobro/ })).not.toBeInTheDocument();
  });

  it('elimina la cita con confirmación de dos pasos', async () => {
    vi.mocked(clinicalApi.deleteAppointmentFully).mockResolvedValue(undefined as never);
    const onClose = vi.fn();
    const onDeleted = vi.fn();
    render(
      <AppointmentChargeModal appointment={APPOINTMENT} onClose={onClose} onDeleted={onDeleted} />,
      { wrapper: makeWrapper() }
    );

    // Primer click: pide confirmación, todavía NO borra.
    await userEvent.click(screen.getByRole('button', { name: /^Eliminar cita$/ }));
    expect(clinicalApi.deleteAppointmentFully).not.toHaveBeenCalled();

    // Segundo click confirma.
    await userEvent.click(screen.getByRole('button', { name: /Sí, eliminar/ }));
    await waitFor(() => {
      expect(clinicalApi.deleteAppointmentFully).toHaveBeenCalledWith('appt-1');
    });
    expect(onDeleted).toHaveBeenCalled();
  });
});
