import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_TYPES, aiService } from './aiService.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('aiService', () => {
  it('keeps supported AI types explicit', () => {
    expect(AI_TYPES.map((type) => type.id)).toEqual([
      'soap',
      'summary',
      'exercises',
      'clinical_analysis',
      'treatment_plan',
      'discharge_letter'
    ]);
  });

  it('rejects empty text before calling fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(aiService.transform({ text: '  ', type: 'soap' })).rejects.toThrow(/escribe/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects unsupported AI type before calling fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(aiService.transform({ text: 'nota valida', type: 'bad_type' })).rejects.toThrow(/tipo/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
