import { describe, expect, it } from 'vitest';
import { buildClinicalRecordHtml, buildClinicalRecordText } from './exportClinicalRecord.js';

describe('buildClinicalRecordText', () => {
  it('includes patient, evaluations, notes and AI consults', () => {
    const text = buildClinicalRecordText({
      full_name: 'Paciente Demo',
      phone: '555',
      status: 'En tratamiento',
      evaluations: [
        {
          evaluation_date: '2026-05-01',
          eva_initial: 7,
          red_flags: 'Negadas',
          prognosis: 'Control motor lumbar',
          sections: { consultation: { medical_diagnosis: 'Lumbalgia' } }
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
    expect(text).toContain('Diagnostico medico: Lumbalgia');
    expect(text).toContain('Diagnostico fisioterapeutico: Control motor lumbar');
    expect(text).toContain('VALORACIONES');
    expect(text).toContain('Sesion #1');
    expect(text).toContain('CONSULTAS IA TRAZABLES');
    expect(text).toContain('Analisis clinico');
  });

  it('builds a styled PDF-safe HTML record and escapes clinical text', () => {
    const html = buildClinicalRecordHtml({
      full_name: '<Paciente>',
      phone: '555',
      status: 'En tratamiento',
      session_notes: [
        {
          session_number: 1,
          session_date: '2026-05-02',
          eva: 5,
          raw_text: '<script>alert("x")</script>'
        }
      ],
      evaluations: [],
      ai_consults: []
    });

    expect(html).toContain('FISIOSELF');
    expect(html).toContain('&lt;Paciente&gt;');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert');
  });
});
