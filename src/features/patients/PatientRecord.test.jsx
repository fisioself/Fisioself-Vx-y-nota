import { describe, expect, it } from 'vitest';
import { buildPatientSummary, getNextSessionNumber } from './PatientRecord.jsx';

describe('getNextSessionNumber', () => {
  it('uses the highest existing session number instead of the row count', () => {
    expect(
      getNextSessionNumber([{ session_number: 1 }, { session_number: 4 }, { session_number: 2 }])
    ).toBe(5);
  });

  it('ignores invalid session numbers safely', () => {
    expect(getNextSessionNumber([{ session_number: 'bad' }, {}, { session_number: 2 }])).toBe(3);
  });

  it('builds a compact clinical summary from evaluations and notes', () => {
    const summary = buildPatientSummary({
      evaluations: [
        {
          evaluation_date: '2026-05-01',
          eva_initial: 8,
          prognosis: 'Control motor lumbar',
          sections: { consultation: { medical_diagnosis: 'Lumbalgia' } }
        }
      ],
      notes: [
        { session_number: 1, session_date: '2026-05-02', eva: 6, raw_text: 'Dolor lumbar' },
        { session_number: 2, session_date: '2026-05-05', eva: 3, raw_text: 'Mejora marcha' }
      ]
    });

    expect(summary.sessionsCount).toBe(2);
    expect(summary.latestEva).toBe(3);
    expect(summary.evaChange).toBe(-5);
    expect(summary.medicalDiagnosis).toBe('Lumbalgia');
    expect(summary.diagnosis).toBe('Control motor lumbar');
    expect(summary.latestNotePreview).toContain('Mejora marcha');
  });
});
