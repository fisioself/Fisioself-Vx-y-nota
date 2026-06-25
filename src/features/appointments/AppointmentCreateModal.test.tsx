import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../app/ToastProvider';
import { clinicalApi } from '../../services/clinicalApi';
import type { Patient } from '../../types/clinical';
import { AppointmentCreateModal, type NewAppointmentSlot } from './AppointmentCreateModal';

vi.mock('../../services/clinicalApi', () => ({
  clinicalApi: {
    searchPatients: vi.fn(),
    createPatient: vi.fn(),
    addAppointment: vi.fn()
  }
}));

const SLOT: NewAppointmentSlot = { start: '2026-06-10T10:00:00', end: '2026-06-10T11:00:00' };
const ANA: Patient = { id: 'patient-1', full_name: 'Ana García', phone: '2221234567' } as Patient;

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
  vi.mocked(clinicalApi.searchPatients).mockReset().mockResolvedValue([]);
  vi.mocked(clinicalApi.createPatient).mockReset();
  vi.mocked(clinicalApi.addAppointment)
    .mockReset()
    .mockResolvedValue({ id: 'appt-1' } as never);
});

describe('AppointmentCreateModal', () => {
  it('no renderiza el diálogo cuando no hay slot', () => {
    render(<AppointmentCreateModal slot={null} onClose={vi.fn()} />, {
      wrapper: makeWrapper()
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('precarga inicio y fin a partir del slot', () => {
    render(<AppointmentCreateModal slot={SLOT} onClose={vi.fn()} />, { wrapper: makeWrapper() });
    expect((screen.getByLabelText(/inicio/i) as HTMLInputElement).value).toBe('2026-06-10T10:00');
    expect((screen.getByLabelText(/^fin/i) as HTMLInputElement).value).toBe('2026-06-10T11:00');
  });

  it('exige seleccionar un paciente antes de agendar', async () => {
    render(<AppointmentCreateModal slot={SLOT} onClose={vi.fn()} />, { wrapper: makeWrapper() });
    await userEvent.click(screen.getByRole('button', { name: /agendar cita/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/selecciona un paciente/i);
    expect(clinicalApi.addAppointment).not.toHaveBeenCalled();
  });

  it('rechaza cuando el fin no es posterior al inicio', async () => {
    vi.mocked(clinicalApi.searchPatients).mockResolvedValue([ANA]);
    render(<AppointmentCreateModal slot={SLOT} onClose={vi.fn()} />, { wrapper: makeWrapper() });

    await userEvent.type(screen.getByRole('searchbox'), 'Ana');
    const pick = await screen.findByRole('button', { name: /Ana García/i });
    await userEvent.click(pick);

    fireEvent.change(screen.getByLabelText(/inicio/i), { target: { value: '2026-06-10T10:00' } });
    fireEvent.change(screen.getByLabelText(/^fin/i), { target: { value: '2026-06-10T09:00' } });
    await userEvent.click(screen.getByRole('button', { name: /agendar cita/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/posterior al inicio/i);
    expect(clinicalApi.addAppointment).not.toHaveBeenCalled();
  });

  it('agenda con paciente y horario válidos y cierra el modal', async () => {
    vi.mocked(clinicalApi.searchPatients).mockResolvedValue([ANA]);
    const onClose = vi.fn();
    render(<AppointmentCreateModal slot={SLOT} onClose={onClose} />, { wrapper: makeWrapper() });

    await userEvent.type(screen.getByRole('searchbox'), 'Ana');
    await userEvent.click(await screen.findByRole('button', { name: /Ana García/i }));

    await userEvent.selectOptions(screen.getByLabelText(/tipo de sesión/i), 'Valoración');
    await userEvent.click(screen.getByRole('button', { name: /agendar cita/i }));

    await waitFor(() => {
      expect(clinicalApi.addAppointment).toHaveBeenCalledWith(
        expect.objectContaining({
          patient_id: 'patient-1',
          title: 'Ana García',
          session_type: 'Valoración',
          color_id: '9'
        })
      );
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('crea un paciente nuevo cuando no existe y lo selecciona para la cita', async () => {
    // Búsqueda sin coincidencias → se ofrece "Paciente nuevo".
    vi.mocked(clinicalApi.searchPatients).mockResolvedValue([]);
    vi.mocked(clinicalApi.createPatient).mockResolvedValue({
      id: 'patient-9',
      full_name: 'Carlos Nuevo'
    } as never);

    render(<AppointmentCreateModal slot={SLOT} onClose={vi.fn()} />, { wrapper: makeWrapper() });

    await userEvent.type(screen.getByRole('searchbox'), 'Carlos Nuevo');
    const createBtn = await screen.findByRole('button', { name: /Paciente nuevo/i });
    await userEvent.click(createBtn);

    await waitFor(() => {
      expect(clinicalApi.createPatient).toHaveBeenCalledWith({ full_name: 'Carlos Nuevo' });
    });
    // Tras crearlo queda seleccionado (aparece su nombre con opción "Cambiar").
    expect(await screen.findByText('Carlos Nuevo')).toBeInTheDocument();
  });

  it('pide confirmación antes de crear un paciente que ya existe (anti-duplicados)', async () => {
    vi.mocked(clinicalApi.searchPatients).mockResolvedValue([ANA]);
    vi.mocked(clinicalApi.createPatient).mockResolvedValue({
      id: 'patient-dup',
      full_name: 'Ana García'
    } as never);

    render(<AppointmentCreateModal slot={SLOT} onClose={vi.fn()} />, { wrapper: makeWrapper() });

    await userEvent.type(screen.getByRole('searchbox'), 'Ana García');
    // Esperamos al resultado real de la búsqueda (lo distinguimos por el teléfono;
    // el botón "Paciente nuevo" también contiene «Ana García» y aparece antes).
    await screen.findByRole('button', { name: /2221234567/i });

    const createBtn = screen.getByRole('button', { name: /Paciente nuevo/i });
    await userEvent.click(createBtn);

    // Primer clic: NO crea, pide confirmar por duplicado.
    expect(clinicalApi.createPatient).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: /toca otra vez para crear uno aparte/i })
    ).toBeInTheDocument();

    // Segundo clic: ahora sí crea.
    await userEvent.click(
      screen.getByRole('button', { name: /toca otra vez para crear uno aparte/i })
    );
    await waitFor(() => {
      expect(clinicalApi.createPatient).toHaveBeenCalledWith({ full_name: 'Ana García' });
    });
  });

  it('muestra el error si addAppointment falla', async () => {
    vi.mocked(clinicalApi.searchPatients).mockResolvedValue([ANA]);
    vi.mocked(clinicalApi.addAppointment).mockRejectedValueOnce(new Error('Falló la red'));
    render(<AppointmentCreateModal slot={SLOT} onClose={vi.fn()} />, { wrapper: makeWrapper() });

    await userEvent.type(screen.getByRole('searchbox'), 'Ana');
    await userEvent.click(await screen.findByRole('button', { name: /Ana García/i }));
    await userEvent.click(screen.getByRole('button', { name: /agendar cita/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/falló la red/i);
  });
});
