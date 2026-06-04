import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clinicalApi } from '../../services/clinicalApi';
import type { Patient } from '../../types/clinical';
import { AppointmentForm } from './AppointmentForm';

vi.mock('../../services/clinicalApi', () => ({
  clinicalApi: {
    addAppointment: vi.fn()
  }
}));

const PATIENT: Patient = { id: 'patient-1', full_name: 'Ana García' } as Patient;

beforeEach(() => {
  vi.mocked(clinicalApi.addAppointment).mockReset();
  vi.mocked(clinicalApi.addAppointment).mockResolvedValue({ id: 'appt-1' } as never);
});

describe('AppointmentForm', () => {
  it('no crea la cita si faltan título o fechas (validación de campos requeridos)', async () => {
    render(<AppointmentForm patient={PATIENT} />);
    await userEvent.click(screen.getByRole('button', { name: /guardar cita/i }));
    // Los campos son required: el submit no llega a llamar al API.
    expect(clinicalApi.addAppointment).not.toHaveBeenCalled();
  });

  it('rechaza cuando la hora de fin no es posterior a la de inicio', async () => {
    render(<AppointmentForm patient={PATIENT} />);
    await userEvent.type(screen.getByLabelText(/titulo/i), 'Sesión');
    fireEvent.change(screen.getByLabelText(/inicio/i), { target: { value: '2026-06-10T10:00' } });
    fireEvent.change(screen.getByLabelText(/^fin/i), { target: { value: '2026-06-10T09:00' } });
    await userEvent.click(screen.getByRole('button', { name: /guardar cita/i }));
    expect(clinicalApi.addAppointment).not.toHaveBeenCalled();
    expect(screen.getByText(/posterior a la de inicio/i)).toBeInTheDocument();
  });

  it('autocompleta la hora de fin (+1h) al elegir el inicio', () => {
    render(<AppointmentForm patient={PATIENT} />);
    const start = screen.getByLabelText(/inicio/i) as HTMLInputElement;
    fireEvent.change(start, { target: { value: '2026-06-10T10:00' } });
    const end = screen.getByLabelText(/^fin/i) as HTMLInputElement;
    expect(end.value).toBe('2026-06-10T11:00');
  });

  it('crea la cita con datos válidos y avisa onCreated', async () => {
    const onCreated = vi.fn();
    render(<AppointmentForm patient={PATIENT} onCreated={onCreated} />);
    await userEvent.type(screen.getByLabelText(/titulo/i), 'Sesión');
    fireEvent.change(screen.getByLabelText(/inicio/i), { target: { value: '2026-06-10T10:00' } });
    fireEvent.change(screen.getByLabelText(/^fin/i), { target: { value: '2026-06-10T11:00' } });
    await userEvent.click(screen.getByRole('button', { name: /guardar cita/i }));
    await waitFor(() => {
      expect(clinicalApi.addAppointment).toHaveBeenCalledWith(
        expect.objectContaining({ patient_id: 'patient-1', title: 'Sesión' })
      );
    });
    expect(onCreated).toHaveBeenCalled();
  });

  it('muestra el error si addAppointment falla', async () => {
    vi.mocked(clinicalApi.addAppointment).mockRejectedValueOnce(new Error('Falló la red'));
    render(<AppointmentForm patient={PATIENT} />);
    await userEvent.type(screen.getByLabelText(/titulo/i), 'Sesión');
    fireEvent.change(screen.getByLabelText(/inicio/i), { target: { value: '2026-06-10T10:00' } });
    fireEvent.change(screen.getByLabelText(/^fin/i), { target: { value: '2026-06-10T11:00' } });
    await userEvent.click(screen.getByRole('button', { name: /guardar cita/i }));
    await waitFor(() => {
      expect(screen.getByText(/falló la red/i)).toBeInTheDocument();
    });
  });
});
