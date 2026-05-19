import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.js';

const assertReady = () => {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase no esta configurado.');
};

const unwrap = ({ data, error }) => {
  if (error) throw error;
  return data;
};

export const clinicalApi = {
  async listPatients() {
    assertReady();
    return unwrap(await supabase
      .from('patients')
      .select('*')
      .order('updated_at', { ascending: false }));
  },

  async createPatient(payload) {
    assertReady();
    return unwrap(await supabase
      .from('patients')
      .insert(payload)
      .select('*')
      .single());
  },

  async getPatient(id) {
    assertReady();
    return unwrap(await supabase
      .from('patients')
      .select('*, session_notes(*), evaluations(*), ai_consults(*)')
      .eq('id', id)
      .single());
  },

  async addSessionNote(payload) {
    assertReady();
    return unwrap(await supabase
      .from('session_notes')
      .insert(payload)
      .select('*')
      .single());
  },

  async addAiConsult(payload) {
    assertReady();
    return unwrap(await supabase
      .from('ai_consults')
      .insert(payload)
      .select('*')
      .single());
  }
};
