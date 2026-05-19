import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_TYPES, aiService } from './aiService.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('aiService', () => {
  it('keeps supported AI types explicit', () => {
    const ids = AI_TYPES.map((type) => type.id);
    expect(ids).toContain('soap');
    expect(ids).toContain('summary');
    expect(ids).toContain('exercises');
    expect(ids).toContain('clinical_analysis');
    expect(ids).toContain('treatment_plan');
    expect(ids).toContain('discharge_letter');
    expect(ids).toContain('informed_consent');
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
