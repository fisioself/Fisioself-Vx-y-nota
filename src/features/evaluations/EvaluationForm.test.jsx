import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { clinicalApi } from '../../services/clinicalApi.js';
import { EvaluationForm } from './EvaluationForm.jsx';

vi.mock('../../services/clinicalApi.js', () => ({
  clinicalApi: {
    addEvaluation: vi.fn()
  }
}));

describe('EvaluationForm', () => {
  it('requires a patient before saving', async () => {
    render(<EvaluationForm />);

    await userEvent.click(screen.getByRole('button', { name: /guardar valoracion/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/selecciona un paciente/i);
    expect(clinicalApi.addEvaluation).not.toHaveBeenCalled();
  });

  it('creates an evaluation with valid data', async () => {
    clinicalApi.addEvaluation.mockResolvedValueOnce({ id: 'eval-1' });
    const onCreated = vi.fn();
    render(<EvaluationForm patientId="patient-1" onCreated={onCreated} />);

    await userEvent.clear(screen.getByLabelText(/eva inicial/i));
    await userEvent.type(screen.getByLabelText(/eva inicial/i), '5');
    await userEvent.type(screen.getByLabelText(/motivo de consulta/i), 'Dolor lumbar');
    await userEvent.click(screen.getByRole('button', { name: /guardar valoracion/i }));

    expect(clinicalApi.addEvaluation).toHaveBeenCalledWith(expect.objectContaining({
      patient_id: 'patient-1',
      eva_initial: 5,
      sections: expect.objectContaining({ reason: 'Dolor lumbar' })
    }));
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'eval-1' }));
  });
});
