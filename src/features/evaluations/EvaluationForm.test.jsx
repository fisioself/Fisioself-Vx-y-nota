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

vi.mock('../patients/PatientDocuments', () => ({
  PatientDocuments: () => <div data-testid="patient-documents-mock" />
}));

describe('EvaluationForm', () => {
  it('requires a patient before saving', async () => {
    render(<EvaluationForm />);

    await userEvent.click(screen.getByRole('button', { name: /guardar valoraci/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/selecciona un paciente/i);
    expect(clinicalApi.addEvaluation).not.toHaveBeenCalled();
  });

  it('creates an evaluation with a zone and a special test', async () => {
    clinicalApi.addEvaluation.mockResolvedValueOnce({ id: 'eval-1' });
    const onCreated = vi.fn();
    render(
      <EvaluationForm
        patient={{ id: 'patient-1', full_name: 'Paciente Demo', phone: '2221234567' }}
        onCreated={onCreated}
      />
    );

    await userEvent.type(screen.getByLabelText(/motivo de consulta/i), 'Dolor de rodilla');
    // Agrega una zona y selecciona Rodilla → despliega su batería de evaluación.
    await userEvent.click(screen.getByRole('button', { name: /agregar zona/i }));
    await userEvent.selectOptions(screen.getByLabelText(/zona a evaluar/i), 'rodilla');
    await userEvent.type(screen.getByLabelText(/intensidad/i), '7');
    // Marca el resultado de una prueba especial del catálogo de la rodilla.
    await userEvent.selectOptions(screen.getByLabelText('Resultado Lachman (LCA)'), 'Negativo');
    await userEvent.click(screen.getByRole('button', { name: /guardar valoraci/i }));

    expect(clinicalApi.addEvaluation).toHaveBeenCalledWith(
      expect.objectContaining({
        patient_id: 'patient-1',
        eva_initial: 7,
        sections: expect.objectContaining({
          consultation: expect.objectContaining({
            reason: 'Dolor de rodilla'
          }),
          zones: expect.arrayContaining([
            expect.objectContaining({
              zone: 'Rodilla',
              special_tests: expect.arrayContaining([
                expect.objectContaining({ name: 'Lachman (LCA)', result: 'Negativo' })
              ])
            })
          ])
        })
      })
    );
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'eval-1' }));
  });
});
