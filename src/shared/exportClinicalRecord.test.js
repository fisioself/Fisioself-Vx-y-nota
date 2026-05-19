import { describe, expect, it } from 'vitest';
import { buildClinicalRecordText } from './exportClinicalRecord.js';

describe('buildClinicalRecordText', () => {
  it('includes patient, evaluations, notes and AI consults', () => {
    const text = buildClinicalRecordText({
      full_name: 'Paciente Demo',
      phone: '555',
      email: 'demo@example.com',
      status: 'En tratamiento',
      medical_diagnosis: 'Lumbalgia',
      functional_diagnosis: 'Dolor lumbar mecanico',
      evaluations: [
        {
          evaluation_date: '2026-05-01',
          eva_initial: 7,
          red_flags: 'Negadas',
          prognosis: 'Bueno'
        }
      ],
      session_notes: [
        {
          session_number: 1,
          session_date: '2026-05-02',
          eva: 5,
          raw_text: 'Tolera ejercicio terapeutico.'
        }
      ],
      ai_consults: [
        {
          type: 'clinical_analysis',
          created_at: '2026-05-03',
          validated: true,
          validation_notes: 'Revisado',
          output_text: 'Analisis clinico'
        }
      ]
    });

    expect(text).toContain('Paciente Demo');
    expect(text).toContain('VALORACIONES');
    expect(text).toContain('Sesion #1');
    expect(text).toContain('CONSULTAS IA TRAZABLES');
    expect(text).toContain('Analisis clinico');
  });
});
