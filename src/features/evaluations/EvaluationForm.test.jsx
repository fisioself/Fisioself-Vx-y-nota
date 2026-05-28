import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { clinicalApi } from '../../services/clinicalApi';
import { EvaluationForm } from './EvaluationForm.jsx';

vi.mock('../../services/clinicalApi', () => ({
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
    render(
      <EvaluationForm
        patient={{ id: 'patient-1', full_name: 'Paciente Demo', phone: '2221234567' }}
        onCreated={onCreated}
      />
    );

    await userEvent.type(screen.getByLabelText(/intensidad/i), '5');
    await userEvent.type(screen.getByLabelText(/motivo de consulta/i), 'Dolor lumbar');
    await userEvent.type(screen.getAllByPlaceholderText(/articulacion/i)[0], 'Rodilla');
    await userEvent.selectOptions(screen.getByDisplayValue('Rango'), 'Funcional');
    await userEvent.type(screen.getByPlaceholderText(/prueba/i), 'Lachman');
    await userEvent.selectOptions(screen.getByDisplayValue('Resultado'), 'Negativo');
    await userEvent.click(screen.getByRole('button', { name: /guardar valoracion/i }));

    expect(clinicalApi.addEvaluation).toHaveBeenCalledWith(
      expect.objectContaining({
        patient_id: 'patient-1',
        eva_initial: 5,
        sections: expect.objectContaining({
          consultation: expect.objectContaining({
            reason: 'Dolor lumbar'
          }),
          physical_exam: expect.objectContaining({
            movement_ranges: [expect.objectContaining({ joint: 'Rodilla', range: 'Funcional' })],
            special_tests: [expect.objectContaining({ name: 'Lachman', result: 'Negativo' })]
          })
        })
      })
    );
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'eval-1' }));
  });
});
