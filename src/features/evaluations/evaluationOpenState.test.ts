import { describe, it, expect, beforeEach } from 'vitest';
import { isEvaluationOpen, setEvaluationOpen } from './evaluationOpenState';

describe('evaluationOpenState', () => {
  beforeEach(() => sessionStorage.clear());

  it('arranca cerrado cuando no hay nada guardado', () => {
    expect(isEvaluationOpen('p1')).toBe(false);
  });

  it('recuerda que la valoración quedó abierta (round-trip por paciente)', () => {
    setEvaluationOpen('p1', true);
    expect(isEvaluationOpen('p1')).toBe(true);
  });

  it('cerrar borra el estado guardado', () => {
    setEvaluationOpen('p1', true);
    setEvaluationOpen('p1', false);
    expect(isEvaluationOpen('p1')).toBe(false);
  });

  it('el estado es independiente entre pacientes', () => {
    setEvaluationOpen('p1', true);
    expect(isEvaluationOpen('p2')).toBe(false);
  });

  it('sin id de paciente no lee ni escribe', () => {
    expect(isEvaluationOpen(undefined)).toBe(false);
    expect(isEvaluationOpen(null)).toBe(false);
    // No debe lanzar al intentar guardar sin id.
    expect(() => setEvaluationOpen(null, true)).not.toThrow();
  });
});
