import { describe, expect, it } from 'vitest';
import { clinicalApi } from './clinicalApi.js';

describe('clinicalApi.buildTimeline', () => {
  it('combines clinical events and sorts newest first', () => {
    const record = {
      evaluations: [
        {
          id: 'eval-1',
          evaluation_date: '2026-05-01',
          prognosis: 'Buen pronostico',
          red_flags: null
        }
      ],
      session_notes: [
        {
          id: 'note-1',
          session_number: 1,
          session_date: '2026-05-03',
          eva: 6
        }
      ],
      ai_consults: [
        {
          id: 'ai-1',
          type: 'clinical_analysis',
          created_at: '2026-05-04T12:00:00.000Z',
          validated: false
        }
      ],
      follow_ups: [
        {
          id: 'follow-1',
          day_number: 7,
          scheduled_date: '2026-05-02',
          status: 'Pendiente'
        }
      ]
    };

    const timeline = clinicalApi.buildTimeline(record);

    expect(timeline).toHaveLength(4);
    expect(timeline.map((item) => item.type)).toEqual([
      'ai_consult',
      'session_note',
      'follow_up',
      'evaluation'
    ]);
    expect(timeline[0]).toMatchObject({
      id: 'ai-1',
      label: 'IA: clinical_analysis',
      description: 'Pendiente de validacion'
    });
  });

  it('returns an empty timeline for empty records', () => {
    expect(clinicalApi.buildTimeline(null)).toEqual([]);
    expect(clinicalApi.buildTimeline({})).toEqual([]);
  });

  it('labels session notes with EVA when available', () => {
    const timeline = clinicalApi.buildTimeline({
      session_notes: [
        {
          id: 'note-1',
          session_number: 3,
          session_date: '2026-05-03',
          eva: 2
        }
      ]
    });

    expect(timeline[0]).toMatchObject({
      type: 'session_note',
      label: 'Sesion #3',
      description: 'EVA 2/10'
    });
  });
});
