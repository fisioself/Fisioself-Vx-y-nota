import { describe, expect, it } from 'vitest';
import { buildPatientPlanHtml } from './exportClinicalRecord';
import type { Evaluation, Patient } from '../types/clinical';

const patient = (over: Partial<Patient> = {}): Patient => ({
  id: 'p1',
  full_name: 'Juan Pérez López',
  functional_goal: 'Cargar a su nieto sin dolor lumbar',
  ...over
});

const evaluation = (conclusion: Record<string, unknown> = {}): Evaluation =>
  ({ id: 'e1', sections: { conclusion } }) as unknown as Evaluation;

describe('buildPatientPlanHtml', () => {
  it('saluda por el primer nombre y muestra la meta funcional', () => {
    const html = buildPatientPlanHtml(evaluation({ objectives: 'Mejorar fuerza' }), patient());
    expect(html).toContain('Hola, Juan');
    expect(html).toContain('Cargar a su nieto sin dolor lumbar');
  });

  it('presenta objetivos/plan/pronóstico bajo encabezados cálidos', () => {
    const html = buildPatientPlanHtml(
      evaluation({
        objectives: 'Recuperar movilidad',
        treatment_plan: 'Ejercicios en casa 3x semana',
        prognosis: 'Recuperación esperada en 6 semanas'
      }),
      patient()
    );
    expect(html).toContain('Tus metas');
    expect(html).toContain('Tu plan de trabajo en casa');
    expect(html).toContain('Tu camino hacia la recuperación');
    expect(html).toContain('Ejercicios en casa 3x semana');
  });

  it('omite las secciones vacías', () => {
    const html = buildPatientPlanHtml(evaluation({ objectives: 'Solo metas' }), patient());
    expect(html).toContain('Tus metas');
    expect(html).not.toContain('Tu plan de trabajo en casa');
    expect(html).not.toContain('Tu camino hacia la recuperación');
  });

  it('limpia los marcadores "(verificar)" de las referencias', () => {
    const html = buildPatientPlanHtml(
      evaluation({ treatment_plan: 'Fortalecimiento según JOSPT (verificar)' }),
      patient()
    );
    expect(html).toContain('Fortalecimiento según JOSPT');
    expect(html).not.toContain('(verificar)');
  });

  it('muestra un texto de respaldo cuando no hay plan capturado', () => {
    const html = buildPatientPlanHtml(evaluation({}), patient({ functional_goal: null }));
    expect(html).toContain('tu próxima visita');
  });
});
