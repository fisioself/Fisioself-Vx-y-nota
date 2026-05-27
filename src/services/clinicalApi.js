import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.js';

const assertReady = () => {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase no esta configurado.');
};

const unwrap = ({ data, error }) => {
  if (error) throw error;
  return data;
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
    return patient;
  },

  async updatePatient(id, payload) {
    assertReady();
    return unwrap(
      await supabase
        .from('patients')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single()
    );
  },

  async deletePatient(id) {
    assertReady();
    return unwrap(await supabase.from('patients').delete().eq('id', id));
  },

  async getPatient(id) {
    assertReady();
    return unwrap(
      await supabase
        .from('patients')
        .select(
          '*, session_notes(*), evaluations(*), ai_consults(*), follow_ups(*), appointments(*)'
        )
        .eq('id', id)
        .single()
    );
  },

  async addEvaluation(payload) {
    assertReady();
    const evaluation = unwrap(
      await supabase.from('evaluations').insert(payload).select('*').single()
    );
    return evaluation;
  },

  async updateEvaluation(id, payload) {
    assertReady();
    return unwrap(
      await supabase
        .from('evaluations')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single()
    );
  },

  async addSessionNote(payload) {
    assertReady();
    const response = await supabase
      .from('session_notes')
      .insert(payload)
      .select('*')
      .single();
    if (response.error?.code === '23505') {
      throw new Error(
        'Ya existe una nota con ese numero de sesion. Actualiza el expediente e intenta de nuevo.'
      );
    }
    const note = unwrap(response);
    return note;
  },

  async updateSessionNote(id, payload) {
    assertReady();
    const response = await supabase
      .from('session_notes')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();

    if (response.error?.code === '23505') {
      throw new Error(
        'Ya existe una nota con ese numero de sesion. Actualiza el expediente e intenta de nuevo.'
      );
    }

    return unwrap(response);
  },

  async deleteSessionNote(id) {
    assertReady();
    return unwrap(await supabase.from('session_notes').delete().eq('id', id));
  },

  async addAiConsult(payload) {
    assertReady();
    const consult = unwrap(await supabase.from('ai_consults').insert(payload).select('*').single());
    return consult;
  },

  async addAppointment(payload) {
    assertReady();
    const appointment = unwrap(
      await supabase.from('appointments').insert(payload).select('*').single()
    );
    return appointment;
  },

  async updateAppointment(id, payload) {
    assertReady();
    return unwrap(
      await supabase
        .from('appointments')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single()
    );
  },

  async getClinicStats() {
    assertReady();
    
    // 1. Total Patients
    const { count: totalPatients, error: pError } = await supabase
      .from('patients')
      .select('*', { count: 'exact', head: true });
    if (pError) throw pError;

    // 2. Sessions in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const { count: recentSessions, error: sError } = await supabase
      .from('session_notes')
      .select('*', { count: 'exact', head: true })
      .gte('session_date', thirtyDaysAgo.toISOString().split('T')[0]);
    if (sError) throw sError;

    // 3. Upcoming Appointments
    const { count: upcomingAppointments, error: aError } = await supabase
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .gte('starts_at', new Date().toISOString())
      .eq('status', 'scheduled');
    if (aError) throw aError;

    // 4. Latest activity (last 5 notes)
    const { data: latestNotes, error: lnError } = await supabase
      .from('session_notes')
      .select('id, session_number, session_date, patients(full_name)')
      .order('created_at', { ascending: false })
      .limit(5);
    if (lnError) throw lnError;

    return {
      totalPatients: totalPatients || 0,
      recentSessions: recentSessions || 0,
      upcomingAppointments: upcomingAppointments || 0,
      latestActivity: latestNotes || []
    };
  },

  buildTimeline(record) {
    const evaluations = (record?.evaluations || []).map((item) => ({
      id: item.id,
      type: 'evaluation',
      label: 'Valoracion inicial',
      date: item.evaluation_date || item.created_at || new Date(0).toISOString(),
      description: item.prognosis || item.red_flags || 'Valoracion registrada',
      payload: item
    }));

    const notes = (record?.session_notes || []).map((item) => ({
      id: item.id,
      type: 'session_note',
      label: `Sesion #${item.session_number}`,
      date: item.session_date || item.created_at || new Date(0).toISOString(),
      description:
        item.eva !== null && item.eva !== undefined ? `EVA ${item.eva}/10` : 'Nota de sesion',
      payload: item
    }));

    const consults = (record?.ai_consults || []).map((item) => ({
      id: item.id,
      type: 'ai_consult',
      label: `IA: ${item.type}`,
      date: item.created_at || new Date(0).toISOString(),
      description: item.validated ? 'Validada' : 'Pendiente de validacion',
      payload: item
    }));

    const followUps = (record?.follow_ups || []).map((item) => ({
      id: item.id,
      type: 'follow_up',
      label: `Seguimiento dia ${item.day_number}`,
      date: item.scheduled_date || item.created_at || new Date(0).toISOString(),
      description: item.status || 'Seguimiento',
      payload: item
    }));

    const appointments = (record?.appointments || []).map((item) => ({
      id: item.id,
      type: 'appointment',
      label: item.title || 'Cita clinica',
      date: item.starts_at || new Date(0).toISOString(),
      description: `${item.status || 'scheduled'} · ${item.sync_status || 'pending'}`,
      payload: item
    }));

    return [...evaluations, ...notes, ...consults, ...followUps, ...appointments]
      .filter((item) => item.date)
      .sort(sortByDateDesc);
  }
};
