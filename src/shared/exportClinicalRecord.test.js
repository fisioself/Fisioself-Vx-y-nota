import { describe, expect, it } from 'vitest';
import { formatTimelineForPrint } from './exportClinicalRecord.js';

describe('formatTimelineForPrint', () => {
  it('formats timeline entries using the raw text payload when available', () => {
    const result = formatTimelineForPrint([
      {
        id: 'n1',
        type: 'session_note',
        label: 'Sesion #1',
        date: '2026-05-02',
        description: 'Nota de sesion',
        payload: { raw_text: 'Tolera ejercicio terapeutico.' }
      }
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('Sesion #1');
    expect(result[0].content).toBe('Tolera ejercicio terapeutico.');
    expect(typeof result[0].date).toBe('string');
  });

  it('falls back to the description when the payload has no raw text', () => {
    const result = formatTimelineForPrint([
      {
        id: 'e1',
        type: 'evaluation',
        label: 'Valoracion inicial',
        date: '2026-05-01',
        description: 'Valoracion registrada',
        payload: { prognosis: 'Control motor lumbar' }
      }
    ]);

    expect(result[0].type).toBe('Valoracion inicial');
    expect(result[0].content).toBe('Valoracion registrada');
  });
});
