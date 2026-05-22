import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_TYPES, aiService } from './aiService.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('aiService', () => {
  it('keeps supported AI types explicit', () => {
    const ids = AI_TYPES.map((type) => type.id);
    expect(ids).toContain('soap');
    expect(ids).toContain('exercises');
    expect(ids).toContain('clinical_analysis');
    expect(ids).toContain('treatment_plan');
  });

  it('rejects empty text before calling fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(aiService.transform({ text: '  ', type: 'soap' })).rejects.toThrow(/escribe/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects unsupported AI type before calling fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(aiService.transform({ text: 'nota valida', type: 'bad_type' })).rejects.toThrow(
      /tipo/i
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('requires an authenticated Supabase session before calling the proxy', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://demo.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    vi.stubEnv('VITE_CLAUDE_PROXY_URL', 'https://example.com/clinical-ai');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { aiService: configuredAiService } = await import('./aiService.js');

    await expect(
      configuredAiService.transform({ text: 'nota clinica valida', type: 'soap' })
    ).rejects.toThrow(/inicia sesion/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
