import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clinicalApi } from '../../services/clinicalApi';
import type { Patient } from '../../types/clinical';
import { PatientEditForm } from './PatientEditForm';

vi.mock('../../services/clinicalApi', () => ({
  clinicalApi: { updatePatient: vi.fn() }
}));

const PATIENT: Patient = {
  id: 'patient-1',
  full_name: 'Ana García',
  phone: '2221234567',
  status: 'En tratamiento'
} as Patient;

beforeEach(() => {
  vi.mocked(clinicalApi.updatePatient).mockReset();
  vi.mocked(clinicalApi.updatePatient).mockResolvedValue({ ...PATIENT } as never);
});

describe('PatientEditForm', () => {
  it('no renderiza nada sin paciente', () => {
    const { container } = render(<PatientEditForm patient={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('precarga los datos del paciente', () => {
    render(<PatientEditForm patient={PATIENT} />);
    expect(screen.getByDisplayValue('Ana García')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2221234567')).toBeInTheDocument();
  });

  it('no actualiza si el nombre queda vacío (validación)', async () => {
    render(<PatientEditForm patient={PATIENT} />);
    await userEvent.clear(screen.getByLabelText(/nombre completo/i));
    await userEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));
    expect(clinicalApi.updatePatient).not.toHaveBeenCalled();
  });

  it('guarda los cambios y avisa onUpdated', async () => {
    const onUpdated = vi.fn();
    render(<PatientEditForm patient={PATIENT} onUpdated={onUpdated} />);
    const name = screen.getByLabelText(/nombre completo/i);
    await userEvent.clear(name);
    await userEvent.type(name, 'Ana G. López');
    await userEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));
    await waitFor(() => {
      expect(clinicalApi.updatePatient).toHaveBeenCalledWith(
        'patient-1',
        expect.objectContaining({ full_name: 'Ana G. López' })
      );
    });
    expect(onUpdated).toHaveBeenCalled();
  });

  it('muestra error si la actualización falla', async () => {
    vi.mocked(clinicalApi.updatePatient).mockRejectedValueOnce(new Error('Conexión perdida'));
    render(<PatientEditForm patient={PATIENT} />);
    await userEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));
    await waitFor(() => {
      expect(screen.getByText(/conexión perdida/i)).toBeInTheDocument();
    });
  });
});
