import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Evaluation } from '../../types/clinical';
import { EvaluationSummary } from './EvaluationSummary';

const makeEvaluation = (sections: Record<string, unknown>): Evaluation =>
  ({ id: 'eval-1', patient_id: 'patient-1', sections } as Evaluation);

describe('EvaluationSummary', () => {
  it('muestra identidad, dolor y motivo de consulta', () => {
    render(
      <EvaluationSummary
        evaluation={makeEvaluation({
          patient_identity: { age: '34', sex: 'F', occupation: 'Maestra', therapist_name: 'Lic. Paz' },
          pain: { location: 'Lumbar', type: 'Punzante', intensity: 7, aggravating_factors: 'Sentarse' },
          consultation: { reason: 'Dolor lumbar', clinical_history: 'Hace 3 semanas' }
        })}
      />
    );

    expect(screen.getByText('Edad: 34')).toBeInTheDocument();
    expect(screen.getByText('Sexo: F')).toBeInTheDocument();
    expect(screen.getByText('Ocupacion: Maestra')).toBeInTheDocument();
    expect(screen.getByText('Localizacion: Lumbar')).toBeInTheDocument();
    expect(screen.getByText('Intensidad: 7/10')).toBeInTheDocument();
    expect(screen.getByText(/Dolor lumbar/)).toBeInTheDocument();
    expect(screen.getByText(/Hace 3 semanas/)).toBeInTheDocument();
  });

  it('usa "No registrado" para los campos faltantes y "No registrada" para el dolor', () => {
    render(<EvaluationSummary evaluation={makeEvaluation({})} />);

    // Varios campos comparten el texto de respaldo.
    expect(screen.getAllByText(/No registrado/).length).toBeGreaterThan(0);
    expect(screen.getByText('Intensidad: No registrada/10')).toBeInTheDocument();
  });

  it('renderiza la tabla de rangos de movimiento solo cuando hay datos', () => {
    render(
      <EvaluationSummary
        evaluation={makeEvaluation({
          physical_exam: {
            movement_ranges: [{ joint: 'Rodilla', range: 'Funcional', notes: 'Sin dolor' }]
          }
        })}
      />
    );

    expect(screen.getByText('Rangos de movimiento')).toBeInTheDocument();
    expect(screen.getByText(/Rodilla: Funcional - Sin dolor/)).toBeInTheDocument();
  });

  it('renderiza fuerza muscular y pruebas especiales cuando existen', () => {
    render(
      <EvaluationSummary
        evaluation={makeEvaluation({
          physical_exam: {
            muscle_strength: [{ joint: 'Cuádriceps', strength: '4/5' }],
            special_tests: [{ name: 'Lachman', result: 'Negativo' }]
          }
        })}
      />
    );

    expect(screen.getByText('Fuerza muscular')).toBeInTheDocument();
    expect(screen.getByText(/Cuádriceps: 4\/5/)).toBeInTheDocument();
    expect(screen.getByText('Pruebas especiales')).toBeInTheDocument();
    expect(screen.getByText(/Lachman: Negativo/)).toBeInTheDocument();
  });

  it('omite las tablas del examen físico cuando no hay filas', () => {
    render(<EvaluationSummary evaluation={makeEvaluation({ physical_exam: {} })} />);

    expect(screen.queryByText('Rangos de movimiento')).not.toBeInTheDocument();
    expect(screen.queryByText('Fuerza muscular')).not.toBeInTheDocument();
    expect(screen.queryByText('Pruebas especiales')).not.toBeInTheDocument();
  });
});
