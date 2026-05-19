import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.js';

const assertReady = () => {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase no esta configurado.');
};

const unwrap = ({ data, error }) => {
  if (error) throw error;
  return data;
};

const audit = async ({ action, entityType, entityId, before, after }) => {
  try {
    await supabase.from('audit_log').insert({
      action,
      entity_type: entityType,
      entity_id: entityId,
      before_json: before || null,
      after_json: after || null
    });
  } catch (error) {
    if (import.meta.env.DEV) console.warn('Audit log failed', error);
  }
};

const sortByDateDesc = (a, b) => new Date(b.date) - new Date(a.date);

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

  async updatePatient(id, payload) {
    assertReady();
    const before = unwrap(await supabase.from('patients').select('*').eq('id', id).single());
    const after = unwrap(
      await supabase
        .from('patients')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .single()
    );
    await audit({ action: 'patient.updated', entityType: 'patients', entityId: id, before, after });
    return after;
  },

  async getPatient(id) {
    assertReady();
    return unwrap(
      await supabase
        .from('patients')
        .select('*, session_notes(*), evaluations(*), ai_consults(*), follow_ups(*), appointments(*)')
        .eq('id', id)
        .single()
    );
  },

  async addEvaluation(payload) {
    assertReady();
    const evaluation = unwrap(await supabase.from('evaluations').insert(payload).select('*').single());
    await audit({ action: 'evaluation.created', entityType: 'evaluations', entityId: evaluation.id, after: evaluation });
    return evaluation;
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
  },

  async addAppointment(payload) {
    assertReady();
    const appointment = unwrap(await supabase.from('appointments').insert(payload).select('*').single());
    await audit({ action: 'appointment.created', entityType: 'appointments', entityId: appointment.id, after: appointment });
    return appointment;
  },

  async updateAppointment(id, payload) {
    assertReady();
    const before = unwrap(await supabase.from('appointments').select('*').eq('id', id).single());
    const after = unwrap(
      await supabase
        .from('appointments')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .single()
    );
    await audit({ action: 'appointment.updated', entityType: 'appointments', entityId: id, before, after });
    return after;
  },

  buildTimeline(record) {
    const evaluations = (record?.evaluations || []).map((item) => ({
      id: item.id,
      type: 'evaluation',
      label: 'Valoracion inicial',
      date: item.evaluation_date || item.created_at,
      description: item.prognosis || item.red_flags || 'Valoracion registrada',
      payload: item
    }));

    const notes = (record?.session_notes || []).map((item) => ({
      id: item.id,
      type: 'session_note',
      label: `Sesion #${item.session_number}`,
      date: item.session_date || item.created_at,
      description: item.eva !== null && item.eva !== undefined ? `EVA ${item.eva}/10` : 'Nota de sesion',
      payload: item
    }));

    const consults = (record?.ai_consults || []).map((item) => ({
      id: item.id,
      type: 'ai_consult',
      label: `IA: ${item.type}`,
      date: item.created_at,
      description: item.validated ? 'Validada' : 'Pendiente de validacion',
      payload: item
    }));

    const followUps = (record?.follow_ups || []).map((item) => ({
      id: item.id,
      type: 'follow_up',
      label: `Seguimiento dia ${item.day_number}`,
      date: item.scheduled_date || item.created_at,
      description: item.status || 'Seguimiento',
      payload: item
    }));

    const appointments = (record?.appointments || []).map((item) => ({
      id: item.id,
      type: 'appointment',
      label: item.title || 'Cita clinica',
      date: item.starts_at,
      description: `${item.status || 'scheduled'} · ${item.sync_status || 'pending'}`,
      payload: item
    }));

    return [...evaluations, ...notes, ...consults, ...followUps, ...appointments].sort(sortByDateDesc);
  }
};
