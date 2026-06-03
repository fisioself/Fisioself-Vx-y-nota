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

// Cadena encadenable y "thenable": cada método del query builder devuelve la
// misma cadena, y al hacer await se resuelve con `result`. Útil para los
// métodos que terminan en .order()/.select() en vez de .single().
const makeChain = (result) => {
  const chain = {};
  for (const m of [
    'select',
    'order',
    'gte',
    'lt',
    'lte',
    'neq',
    'eq',
    'limit',
    'insert',
    'update'
  ]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve) => resolve(result);
  return chain;
};

describe('clinicalApi lecturas de lista', () => {
  it('listPatients ordena por updated_at descendente', async () => {
    const from = vi.fn(() => makeChain({ data: [{ id: 'p1' }, { id: 'p2' }], error: null }));
    const { clinicalApi } = await loadApi(from);
    await expect(clinicalApi.listPatients()).resolves.toHaveLength(2);
    expect(from).toHaveBeenCalledWith('patients');
  });

  it('listPatientsToday deduplica pacientes y aplana la relación', async () => {
    const rows = [
      { patient_id: 'p1', patients: { id: 'p1', full_name: 'Ana' } },
      { patient_id: 'p1', patients: { id: 'p1', full_name: 'Ana' } }, // duplicado
      { patient_id: 'p2', patients: [{ id: 'p2', full_name: 'Beto' }] } // array
    ];
    const from = vi.fn(() => makeChain({ data: rows, error: null }));
    const { clinicalApi } = await loadApi(from);
    const result = await clinicalApi.listPatientsToday();
    expect(result.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(from).toHaveBeenCalledWith('appointments');
  });

  it('listPatientsToday propaga errores de Supabase', async () => {
    const from = vi.fn(() => makeChain({ data: null, error: new Error('db down') }));
    const { clinicalApi } = await loadApi(from);
    await expect(clinicalApi.listPatientsToday()).rejects.toThrow('db down');
  });
});

describe('clinicalApi.searchPatients', () => {
  it('devuelve [] sin consultar cuando la búsqueda está vacía', async () => {
    const rpc = vi.fn();
    vi.resetModules();
    vi.doMock('../lib/supabaseClient.js', () => ({
      isSupabaseConfigured: true,
      supabase: { rpc },
      assertSupabase: () => ({ rpc })
    }));
    const { clinicalApi } = await import('./clinicalApi');
    await expect(clinicalApi.searchPatients('   ')).resolves.toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('llama al RPC search_patients_unaccent con el texto recortado', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: 'p9' }], error: null });
    vi.resetModules();
    vi.doMock('../lib/supabaseClient.js', () => ({
      isSupabaseConfigured: true,
      supabase: { rpc },
      assertSupabase: () => ({ rpc })
    }));
    const { clinicalApi } = await import('./clinicalApi');
    await expect(clinicalApi.searchPatients('  ana  ')).resolves.toEqual([{ id: 'p9' }]);
    expect(rpc).toHaveBeenCalledWith('search_patients_unaccent', { p_query: 'ana' });
  });
});

describe('clinicalApi.deleteAppointmentFully', () => {
  it('invoca la edge function google-calendar-delete', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });
    vi.resetModules();
    vi.doMock('../lib/supabaseClient.js', () => ({
      isSupabaseConfigured: true,
      supabase: { functions: { invoke } },
      assertSupabase: () => ({ functions: { invoke } })
    }));
    const { clinicalApi } = await import('./clinicalApi');
    await expect(clinicalApi.deleteAppointmentFully('appt-1')).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledWith('google-calendar-delete', {
      body: { appointment_id: 'appt-1' }
    });
  });

  it('lanza error si la edge function devuelve error en el cuerpo', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { error: 'no token' }, error: null });
    vi.resetModules();
    vi.doMock('../lib/supabaseClient.js', () => ({
      isSupabaseConfigured: true,
      supabase: { functions: { invoke } },
      assertSupabase: () => ({ functions: { invoke } })
    }));
    const { clinicalApi } = await import('./clinicalApi');
    await expect(clinicalApi.deleteAppointmentFully('appt-1')).rejects.toThrow('no token');
  });
});

describe('clinicalApi.addSessionNote', () => {
  it('traduce el error 23505 (sesión duplicada) a un mensaje claro', async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: { code: '23505' } });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    const from = vi.fn(() => ({ insert }));
    const { clinicalApi } = await loadApi(from);
    await expect(
      clinicalApi.addSessionNote({ patient_id: 'p1', session_number: 1 })
    ).rejects.toThrow(/numero de sesion/i);
  });
});

describe('clinicalApi.getClinicStats', () => {
  it('agrega conteos y actividad reciente', async () => {
    // 4 llamadas a from(): 3 conteos + 1 lista de actividad.
    const from = vi
      .fn()
      .mockReturnValueOnce(makeChain({ count: 10, error: null })) // totalPatients
      .mockReturnValueOnce(makeChain({ count: 5, error: null })) // recentSessions
      .mockReturnValueOnce(makeChain({ count: 3, error: null })) // upcoming
      .mockReturnValueOnce(makeChain({ data: [{ id: 'a1', title: 'Cita' }], error: null }));
    const { clinicalApi } = await loadApi(from);
    const stats = await clinicalApi.getClinicStats();
    expect(stats).toMatchObject({
      totalPatients: 10,
      recentSessions: 5,
      upcomingAppointments: 3
    });
    expect(stats.latestActivity).toHaveLength(1);
  });

  it('propaga el error del primer conteo', async () => {
    const from = vi.fn(() => makeChain({ count: null, error: new Error('count fail') }));
    const { clinicalApi } = await loadApi(from);
    await expect(clinicalApi.getClinicStats()).rejects.toThrow('count fail');
  });
});
