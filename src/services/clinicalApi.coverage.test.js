import { afterEach, describe, expect, it, vi } from 'vitest';

// Mismo patrón que clinicalApiWrites.test.js: mockeamos supabaseClient y
// construimos cadenas mínimas por método. Cubre wrappers simples del API.
const loadApi = async (from) => {
  vi.resetModules();
  vi.doMock('../lib/supabaseClient.js', () => ({
    isSupabaseConfigured: true,
    supabase: { from },
    assertSupabase: () => ({ from })
  }));
  return import('./clinicalApi');
};

afterEach(() => {
  vi.doUnmock('../lib/supabaseClient.js');
  vi.restoreAllMocks();
});

// insert(...).select('*').single()
const insertSingle = (data) => {
  const single = vi.fn().mockResolvedValue({ data, error: null });
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  return vi.fn(() => ({ insert }));
};

// update(...).eq(...).select('*').single()
const updateSingle = (data) => {
  const single = vi.fn().mockResolvedValue({ data, error: null });
  const select = vi.fn(() => ({ single }));
  const eq = vi.fn(() => ({ select }));
  const update = vi.fn(() => ({ eq }));
  return vi.fn(() => ({ update }));
};

describe('clinicalApi.getNextSessionNumber', () => {
  const buildFrom = (rows) => {
    const limit = vi.fn().mockResolvedValue({ data: rows, error: null });
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    return vi.fn(() => ({ select }));
  };

  it('devuelve max + 1 cuando ya hay notas', async () => {
    const { clinicalApi } = await loadApi(buildFrom([{ session_number: 7 }]));
    expect(await clinicalApi.getNextSessionNumber('p1')).toBe(8);
  });

  it('devuelve 1 cuando el paciente no tiene notas', async () => {
    const { clinicalApi } = await loadApi(buildFrom([]));
    expect(await clinicalApi.getNextSessionNumber('p1')).toBe(1);
  });
});

describe('clinicalApi wrappers simples', () => {
  it('addEvaluation inserta en evaluations', async () => {
    const from = insertSingle({ id: 'eval-1' });
    const { clinicalApi } = await loadApi(from);
    await expect(clinicalApi.addEvaluation({ patient_id: 'p1' })).resolves.toMatchObject({
      id: 'eval-1'
    });
    expect(from).toHaveBeenCalledWith('evaluations');
  });

  it('updateEvaluation actualiza evaluations', async () => {
    const from = updateSingle({ id: 'eval-1', prognosis: 'ok' });
    const { clinicalApi } = await loadApi(from);
    await expect(
      clinicalApi.updateEvaluation('eval-1', { prognosis: 'ok' })
    ).resolves.toMatchObject({ id: 'eval-1' });
    expect(from).toHaveBeenCalledWith('evaluations');
  });

  it('addAiConsult inserta en ai_consults', async () => {
    const from = insertSingle({ id: 'ai-1' });
    const { clinicalApi } = await loadApi(from);
    await expect(clinicalApi.addAiConsult({ patient_id: 'p1', type: 'x' })).resolves.toMatchObject({
      id: 'ai-1'
    });
    expect(from).toHaveBeenCalledWith('ai_consults');
  });

  it('updateAppointment actualiza appointments', async () => {
    const from = updateSingle({ id: 'appt-1' });
    const { clinicalApi } = await loadApi(from);
    await expect(
      clinicalApi.updateAppointment('appt-1', { title: 'Nueva' })
    ).resolves.toMatchObject({ id: 'appt-1' });
    expect(from).toHaveBeenCalledWith('appointments');
  });

  it('getPatient lee el expediente del paciente', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 'p1', full_name: 'Ana' }, error: null });
    const eq = vi.fn(() => ({ single }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const { clinicalApi } = await loadApi(from);
    await expect(clinicalApi.getPatient('p1')).resolves.toMatchObject({ id: 'p1' });
    expect(from).toHaveBeenCalledWith('patients');
  });
});
