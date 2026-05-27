import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.js';

export interface Patient {
  id: string;
  full_name: string;
  email?: string;
  phone?: string;
  birth_date?: string;
  sex?: string;
  status: string;
  medical_diagnosis?: string;
  functional_diagnosis?: string;
  updated_at: string;
}

export interface SessionNote {
  id: string;
  patient_id: string;
  therapist_id?: string;
  session_number: number;
  session_date: string;
  eva?: number;
  raw_text: string;
  created_at: string;
}

const assertReady = () => {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase no esta configurado.');
};

const unwrap = ({ data, error }: { data: any; error: any }) => {
  if (error) throw error;
  return data;
};

const sortByDateDesc = (a: any, b: any) => 
  new Date(b.date).getTime() - new Date(a.date).getTime();

export const clinicalApi = {
  async listPatients(): Promise<Patient[]> {
    assertReady();
    return unwrap(
      await (supabase as any).from('patients').select('*').order('updated_at', { ascending: false })
    );
  },

  async createPatient(payload: Partial<Patient>): Promise<Patient> {
    assertReady();
    const patient = unwrap(await (supabase as any).from('patients').insert(payload).select('*').single());
    return patient;
  },

  async updatePatient(id: string, payload: Partial<Patient>): Promise<Patient> {
    assertReady();
    return unwrap(
      await (supabase as any)
        .from('patients')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single()
    );
  },

  async deletePatient(id: string): Promise<void> {
    assertReady();
    return unwrap(await (supabase as any).from('patients').delete().eq('id', id));
  },

  async getPatient(id: string) {
    assertReady();
    return unwrap(
      await (supabase as any)
        .from('patients')
        .select(
          '*, session_notes(*), evaluations(*), ai_consults(*), follow_ups(*), appointments(*)'
        )
        .eq('id', id)
        .single()
    );
  },

  async addEvaluation(payload: any) {
    assertReady();
    const evaluation = unwrap(
      await (supabase as any).from('evaluations').insert(payload).select('*').single()
    );
    return evaluation;
  },

  async updateEvaluation(id: string, payload: any) {
    assertReady();
    return unwrap(
      await (supabase as any)
        .from('evaluations')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single()
    );
  },

  async addSessionNote(payload: Partial<SessionNote>): Promise<SessionNote> {
    assertReady();
    const response = await (supabase as any)
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

  async updateSessionNote(id: string, payload: Partial<SessionNote>): Promise<SessionNote> {
    assertReady();
    const response = await (supabase as any)
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

  async deleteSessionNote(id: string): Promise<void> {
    assertReady();
    return unwrap(await (supabase as any).from('session_notes').delete().eq('id', id));
  },

  async addAiConsult(payload: any) {
    assertReady();
    const consult = unwrap(await (supabase as any).from('ai_consults').insert(payload).select('*').single());
    return consult;
  },

  async addAppointment(payload: any) {
    assertReady();
    const appointment = unwrap(
      await (supabase as any).from('appointments').insert(payload).select('*').single()
    );
    return appointment;
  },

  async updateAppointment(id: string, payload: any) {
    assertReady();
    return unwrap(
      await (supabase as any)
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
    const { count: totalPatients, error: pError } = await (supabase as any)
      .from('patients')
      .select('*', { count: 'exact', head: true });
    if (pError) throw pError;

    // 2. Sessions in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const { count: recentSessions, error: sError } = await (supabase as any)
      .from('session_notes')
      .select('*', { count: 'exact', head: true })
      .gte('session_date', thirtyDaysAgo.toISOString().split('T')[0]);
    if (sError) throw sError;

    // 3. Upcoming Appointments
    const { count: upcomingAppointments, error: aError } = await (supabase as any)
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .gte('starts_at', new Date().toISOString())
      .eq('status', 'scheduled');
    if (aError) throw aError;

    // 4. Latest activity (last 5 notes)
    const { data: latestNotes, error: lnError } = await (supabase as any)
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

  buildTimeline(record: any) {
    const evaluations = (record?.evaluations || []).map((item: any) => ({
      id: item.id,
      type: 'evaluation',
      label: 'Valoracion inicial',
      date: item.evaluation_date || item.created_at || new Date(0).toISOString(),
      description: item.prognosis || item.red_flags || 'Valoracion registrada',
      payload: item
    }));

    const notes = (record?.session_notes || []).map((item: any) => ({
      id: item.id,
      type: 'session_note',
      label: `Sesion #${item.session_number}`,
      date: item.session_date || item.created_at || new Date(0).toISOString(),
      description:
        item.eva !== null && item.eva !== undefined ? `EVA ${item.eva}/10` : 'Nota de sesion',
      payload: item
    }));

    const consults = (record?.ai_consults || []).map((item: any) => ({
      id: item.id,
      type: 'ai_consult',
      label: `IA: ${item.type}`,
      date: item.created_at || new Date(0).toISOString(),
      description: item.validated ? 'Validada' : 'Pendiente de validacion',
      payload: item
    }));

    const followUps = (record?.follow_ups || []).map((item: any) => ({
      id: item.id,
      type: 'follow_up',
      label: `Seguimiento dia ${item.day_number}`,
      date: item.scheduled_date || item.created_at || new Date(0).toISOString(),
      description: item.status || 'Seguimiento',
      payload: item
    }));

    const appointments = (record?.appointments || []).map((item: any) => ({
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
