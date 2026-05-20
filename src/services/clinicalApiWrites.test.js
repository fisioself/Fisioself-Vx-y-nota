import { afterEach, describe, expect, it, vi } from 'vitest';

const loadClinicalApi = async (from) => {
  vi.resetModules();
  vi.doMock('../lib/supabaseClient.js', () => ({
    isSupabaseConfigured: true,
    supabase: { from }
  }));

  return import('./clinicalApi.js');
};

afterEach(() => {
  vi.doUnmock('../lib/supabaseClient.js');
  vi.restoreAllMocks();
});

describe('clinicalApi writes', () => {
  it('creates appointments without browser audit writes', async () => {
    const single = vi.fn().mockResolvedValue({
      data: { id: 'appointment-1', title: 'Cita Fisioself' },
      error: null
    });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    const from = vi.fn(() => ({ insert }));
    const { clinicalApi } = await loadClinicalApi(from);

    const appointment = await clinicalApi.addAppointment({ title: 'Cita Fisioself' });

    expect(appointment).toMatchObject({ id: 'appointment-1' });
    expect(from).toHaveBeenCalledWith('appointments');
    expect(from).not.toHaveBeenCalledWith('audit_log');
  });

  it('updates patients directly and leaves auditing to database triggers', async () => {
    const single = vi.fn().mockResolvedValue({
      data: { id: 'patient-1', full_name: 'Paciente Demo' },
      error: null
    });
    const select = vi.fn(() => ({ single }));
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));
    const { clinicalApi } = await loadClinicalApi(from);

    const patient = await clinicalApi.updatePatient('patient-1', { full_name: 'Paciente Demo' });

    expect(patient).toMatchObject({ id: 'patient-1' });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        full_name: 'Paciente Demo',
        updated_at: expect.any(String)
      })
    );
    expect(from).not.toHaveBeenCalledWith('audit_log');
  });

  it('deletes patients through the patients table and leaves auditing to database triggers', async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: null });
    const deleteFn = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ delete: deleteFn }));
    const { clinicalApi } = await loadClinicalApi(from);

    await expect(clinicalApi.deletePatient('patient-1')).resolves.toBeNull();

    expect(from).toHaveBeenCalledWith('patients');
    expect(deleteFn).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith('id', 'patient-1');
    expect(from).not.toHaveBeenCalledWith('audit_log');
  });
});
