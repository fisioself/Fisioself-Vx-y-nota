import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../app/ToastProvider';
import { clinicalApi } from '../../services/clinicalApi';
import { calendarService } from '../../services/calendarService';
import type { Appointment, Patient } from '../../types/clinical';
import { AppointmentList } from './AppointmentList';

vi.mock('../../services/clinicalApi', () => ({
  clinicalApi: { updateAppointment: vi.fn() }
}));
vi.mock('../../services/calendarService', () => ({
  calendarService: { syncAppointment: vi.fn() }
}));
// El formulario hijo no es objeto de esta prueba.
vi.mock('./AppointmentForm', () => ({
  AppointmentForm: () => <div data-testid="appointment-form-mock" />
}));

const PATIENT: Patient = {
  id: 'patient-1',
  full_name: 'Ana García',
  phone: '2221234567'
} as Patient;

const APPOINTMENTS: Appointment[] = [
  {
    id: 'appt-1',
    patient_id: 'patient-1',
    title: 'Sesión 1',
    starts_at: '2026-06-10T16:00:00.000Z',
    ends_at: '2026-06-10T17:00:00.000Z',
    status: 'scheduled',
    sync_status: 'pending',
    description: 'Primera sesión'
  } as Appointment
];

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ToastProvider>{children}</ToastProvider>
);

beforeEach(() => {
  vi.mocked(clinicalApi.updateAppointment).mockReset();
  vi.mocked(clinicalApi.updateAppointment).mockResolvedValue({} as never);
  vi.mocked(calendarService.syncAppointment).mockReset();
  vi.mocked(calendarService.syncAppointment).mockResolvedValue({} as never);
});

describe('AppointmentList', () => {
  it('muestra mensaje vacío cuando no hay citas', () => {
    render(<AppointmentList patient={PATIENT} appointments={[]} />, { wrapper });
    expect(screen.getByText(/no hay citas programadas/i)).toBeInTheDocument();
  });

  it('renderiza las citas existentes', () => {
    render(<AppointmentList patient={PATIENT} appointments={APPOINTMENTS} />, { wrapper });
    expect(screen.getByText('Sesión 1')).toBeInTheDocument();
    expect(screen.getByText('Primera sesión')).toBeInTheDocument();
  });

  it('cancelar cita pide confirmación antes de llamar al API', async () => {
    render(<AppointmentList patient={PATIENT} appointments={APPOINTMENTS} />, { wrapper });
    await userEvent.click(screen.getByRole('button', { name: /cancelar cita/i }));
    // Aún no se llama: aparece el diálogo de confirmación.
    expect(clinicalApi.updateAppointment).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // Confirmar dentro del diálogo.
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /cancelar cita/i }));
    await waitFor(() => {
      expect(clinicalApi.updateAppointment).toHaveBeenCalledWith('appt-1', { status: 'cancelled' });
    });
  });

  it('sincronizar llama a calendarService', async () => {
    render(<AppointmentList patient={PATIENT} appointments={APPOINTMENTS} />, { wrapper });
    await userEvent.click(screen.getByRole('button', { name: /sincronizar/i }));
    await waitFor(() => {
      expect(calendarService.syncAppointment).toHaveBeenCalledWith('appt-1');
    });
  });

  it('no muestra acciones de cancelar para una cita ya cancelada', () => {
    const cancelled = [{ ...APPOINTMENTS[0], status: 'cancelled' } as Appointment];
    render(<AppointmentList patient={PATIENT} appointments={cancelled} />, { wrapper });
    expect(screen.getByText('Cancelada')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancelar cita/i })).not.toBeInTheDocument();
  });
});
