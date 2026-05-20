import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clinicalApi } from '../../services/clinicalApi.js';
import { AppointmentForm } from './AppointmentForm.jsx';

vi.mock('../../services/clinicalApi.js', () => ({
  clinicalApi: {
    addAppointment: vi.fn()
  }
}));

describe('AppointmentForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses a PHI-free default title', () => {
    render(<AppointmentForm patient={{ id: 'patient-1', full_name: 'Paciente Demo' }} />);

    expect(screen.getByLabelText(/titulo/i)).toHaveValue('Cita Fisioself');
  });

  it('creates an appointment with the sanitized default title', async () => {
    clinicalApi.addAppointment.mockResolvedValueOnce({ id: 'appointment-1' });
    const onCreated = vi.fn();

    render(
      <AppointmentForm
        patient={{ id: 'patient-1', full_name: 'Paciente Demo' }}
        therapistId="therapist-1"
        onCreated={onCreated}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /crear cita/i }));

    expect(clinicalApi.addAppointment).toHaveBeenCalledWith(
      expect.objectContaining({
        patient_id: 'patient-1',
        therapist_id: 'therapist-1',
        title: 'Cita Fisioself',
        sync_status: 'pending'
      })
    );
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'appointment-1' }));
  });

  it('validates patient and time before creating an appointment', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<AppointmentForm />);

    await user.click(screen.getByRole('button', { name: /crear cita/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/selecciona un paciente/i);
    expect(clinicalApi.addAppointment).not.toHaveBeenCalled();

    rerender(<AppointmentForm patient={{ id: 'patient-1' }} />);
    await user.clear(screen.getByLabelText(/fin/i));
    await user.type(screen.getByLabelText(/fin/i), '2020-01-01T10:00');
    await user.click(screen.getByRole('button', { name: /crear cita/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/hora de fin/i);
    expect(clinicalApi.addAppointment).not.toHaveBeenCalled();
  });
});
