import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.js';

const assertReady = () => {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase no esta configurado.');
};

const unwrap = ({ data, error }) => {
  if (error) throw error;
  return data;
};

const audit = async ({ action, entityType, entityId, after }) => {
  try {
    await supabase.from('audit_log').insert({
      action,
      entity_type: entityType,
      entity_id: entityId,
      after_json: after || null
    });
  } catch (error) {
    if (import.meta.env.DEV) console.warn('Audit log failed', error);
  }
};

export const clinicalApi = {
  async listPatients() {
    assertReady();
    return unwrap(
      await supabase.from('patients').select('*').order('updated_at', { ascending: false })
    );
  },

  async createPatient(payload) {
    assertReady();
    const patient = unwrap(await supabase.from('patients').insert(payload).select('*').single());
    await audit({ action: 'patient.created', entityType: 'patients', entityId: patient.id, after: patient });
    return patient;
  },

  async getPatient(id) {
    assertReady();
    return unwrap(
      await supabase
        .from('patients')
        .select('*, session_notes(*), evaluations(*), ai_consults(*)')
        .eq('id', id)
        .single()
    );
  },

  async addSessionNote(payload) {
    assertReady();
    const note = unwrap(await supabase.from('session_notes').insert(payload).select('*').single());
    await audit({ action: 'session_note.created', entityType: 'session_notes', entityId: note.id, after: note });
    return note;
  },

  async addAiConsult(payload) {
    assertReady();
    const consult = unwrap(await supabase.from('ai_consults').insert(payload).select('*').single());
    await audit({ action: 'ai_consult.created', entityType: 'ai_consults', entityId: consult.id, after: consult });
    return consult;
  }
};
