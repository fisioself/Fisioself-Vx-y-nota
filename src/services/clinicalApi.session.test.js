import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('../lib/supabaseClient.js');
});

describe('clinicalApi.addSessionNote', () => {
  it('turns duplicate session numbers into a clear clinical error', async () => {
    const single = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' }
    });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    const from = vi.fn(() => ({ insert }));

    vi.doMock('../lib/supabaseClient.js', () => ({
      isSupabaseConfigured: true,
      supabase: { from }
    }));

    const { clinicalApi } = await import('./clinicalApi.js');

    await expect(
      clinicalApi.addSessionNote({
        patient_id: 'patient-1',
        session_number: 1,
        session_date: '2026-05-19',
        raw_text: 'Nota valida'
      })
    ).rejects.toThrow(/ya existe una nota/i);
  });
});
