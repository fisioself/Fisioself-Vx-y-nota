import { afterEach, describe, expect, it, vi } from 'vitest';

const loadClinicalApi = async (from) => {
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
        full_name: 'Paciente Demo'
      })
    );
    expect(from).not.toHaveBeenCalledWith('audit_log');
  });

  it('soft-deletes patients through the delete_patient RPC (no physical delete)', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const from = vi.fn();
    vi.resetModules();
    vi.doMock('../lib/supabaseClient.js', () => ({
      isSupabaseConfigured: true,
      supabase: { rpc, from },
      assertSupabase: () => ({ rpc, from })
    }));
    const { clinicalApi } = await import('./clinicalApi');

    await expect(clinicalApi.deletePatient('patient-1')).resolves.toBeUndefined();

    // El soft-delete se hace vía RPC SECURITY DEFINER para evitar el conflicto
    // de RLS al poner deleted_at; no es un borrado físico ni un update directo.
    expect(rpc).toHaveBeenCalledWith('delete_patient', { patient_id: 'patient-1' });
    expect(from).not.toHaveBeenCalledWith('patients');
    expect(from).not.toHaveBeenCalledWith('audit_log');
  });

  it('lists deleted patients through the list_deleted_patients RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: 'patient-9', full_name: 'Borrado Demo', deleted_at: '2026-06-01T00:00:00Z' }],
      error: null
    });
    vi.resetModules();
    vi.doMock('../lib/supabaseClient.js', () => ({
      isSupabaseConfigured: true,
      supabase: { rpc },
      assertSupabase: () => ({ rpc })
    }));
    const { clinicalApi } = await import('./clinicalApi');

    const deleted = await clinicalApi.listDeletedPatients();

    expect(rpc).toHaveBeenCalledWith('list_deleted_patients');
    expect(deleted).toEqual([
      expect.objectContaining({ id: 'patient-9', full_name: 'Borrado Demo' })
    ]);
  });

  it('restores a patient through the restore_patient RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.resetModules();
    vi.doMock('../lib/supabaseClient.js', () => ({
      isSupabaseConfigured: true,
      supabase: { rpc },
      assertSupabase: () => ({ rpc })
    }));
    const { clinicalApi } = await import('./clinicalApi');

    await expect(clinicalApi.restorePatient('patient-9')).resolves.toBeUndefined();

    expect(rpc).toHaveBeenCalledWith('restore_patient', { p_id: 'patient-9' });
  });

  it('updates session notes and leaves auditing to database triggers', async () => {
    const single = vi.fn().mockResolvedValue({
      data: { id: 'note-1', raw_text: 'Nota editada' },
      error: null
    });
    const select = vi.fn(() => ({ single }));
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));
    const { clinicalApi } = await loadClinicalApi(from);

    const note = await clinicalApi.updateSessionNote('note-1', { raw_text: 'Nota editada' });

    expect(note).toMatchObject({ id: 'note-1' });
    expect(from).toHaveBeenCalledWith('session_notes');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        raw_text: 'Nota editada'
      })
    );
    expect(from).not.toHaveBeenCalledWith('audit_log');
  });

  it('deletes session notes through the notes table and leaves auditing to database triggers', async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: null });
    const deleteFn = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ delete: deleteFn }));
    const { clinicalApi } = await loadClinicalApi(from);

    await expect(clinicalApi.deleteSessionNote('note-1')).resolves.toBeNull();

    expect(from).toHaveBeenCalledWith('session_notes');
    expect(deleteFn).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith('id', 'note-1');
    expect(from).not.toHaveBeenCalledWith('audit_log');
  });
});
