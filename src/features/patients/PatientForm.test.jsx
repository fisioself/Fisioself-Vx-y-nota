import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { clinicalApi } from '../../services/clinicalApi';
import { PatientForm } from './PatientForm.jsx';

vi.mock('../../services/clinicalApi', () => ({
  clinicalApi: {
    createPatient: vi.fn()
  }
}));

describe('PatientForm', () => {
  it('validates required name', async () => {
    render(<PatientForm />);

    await userEvent.click(screen.getByRole('button', { name: /crear paciente/i }));

    expect(clinicalApi.createPatient).not.toHaveBeenCalled();
  });

  it('creates a patient with valid data', async () => {
    clinicalApi.createPatient.mockResolvedValueOnce({
      id: 'patient-1',
      full_name: 'Paciente Demo'
    });
    const onCreated = vi.fn();
    render(<PatientForm onCreated={onCreated} />);

    await userEvent.type(screen.getByLabelText(/nombre completo/i), 'Paciente Demo');
    await userEvent.type(screen.getByLabelText(/telefono/i), '2221234567');
    await userEvent.click(screen.getByRole('button', { name: /crear paciente/i }));

    expect(clinicalApi.createPatient).toHaveBeenCalledWith(
      expect.objectContaining({
        full_name: 'Paciente Demo',
        phone: '2221234567'
      })
    );
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'patient-1' }));
  });
});
