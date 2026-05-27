import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import type {
  AiConsult,
  Appointment,
  ClinicalRecord,
  ClinicStats,
  Evaluation,
  Patient,
  SessionNote,
  TimelineEntry
} from '../types/clinical';

interface SupabaseResult<T> {
  data: T | null;
  error: (Error & { code?: string }) | null;
}

const assertReady = (): SupabaseClient => {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase no esta configurado.');
  return supabase;
};

const unwrap = <T>({ data, error }: SupabaseResult<T>): T => {
  if (error) throw error;
  return data as T;
};

const sortByDateDesc = (a: TimelineEntry, b: TimelineEntry): number =>
  new Date(b.date).getTime() - new Date(a.date).getTime();

export const clinicalApi = {
  async listPatients(): Promise<Patient[]> {
    const db = assertReady();
    return unwrap(await db.from('patients').select('*').order('updated_at', { ascending: false }));
  },

  async createPatient(payload: Partial<Patient>): Promise<Patient> {
    const db = assertReady();
    return unwrap(await db.from('patients').insert(payload).select('*').single());
  },

  async updatePatient(id: string, payload: Partial<Patient>): Promise<Patient> {
    const db = assertReady();
    return unwrap(await db.from('patients').update(payload).eq('id', id).select('*').single());
  },

  async deletePatient(id: string): Promise<unknown> {
    const db = assertReady();
    return unwrap(await db.from('patients').delete().eq('id', id));
  },

  async getPatient(id: string): Promise<ClinicalRecord> {
    const db = assertReady();
    return unwrap(
      await db
        .from('patients')
        .select(
          '*, session_notes(*), evaluations(*), ai_consults(*), follow_ups(*), appointments(*)'
        )
        .eq('id', id)
        .single()
    );
  },

  async addEvaluation(payload: Partial<Evaluation>): Promise<Evaluation> {
    const db = assertReady();
    return unwrap(await db.from('evaluations').insert(payload).select('*').single());
  },

  async updateEvaluation(id: string, payload: Partial<Evaluation>): Promise<Evaluation> {
    const db = assertReady();
    return unwrap(await db.from('evaluations').update(payload).eq('id', id).select('*').single());
  },

  async addSessionNote(payload: Partial<SessionNote>): Promise<SessionNote> {
    const db = assertReady();
    const response = (await db
      .from('session_notes')
      .insert(payload)
      .select('*')
      .single()) as SupabaseResult<SessionNote>;
    if (response.error?.code === '23505') {
      throw new Error(
        'Ya existe una nota con ese numero de sesion. Actualiza el expediente e intenta de nuevo.'
      );
    }
    return unwrap(response);
  },

  async updateSessionNote(id: string, payload: Partial<SessionNote>): Promise<SessionNote> {
    const db = assertReady();
    const response = (await db
      .from('session_notes')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single()) as SupabaseResult<SessionNote>;

    if (response.error?.code === '23505') {
      throw new Error(
        'Ya existe una nota con ese numero de sesion. Actualiza el expediente e intenta de nuevo.'
      );
    }

    return unwrap(response);
  },

  async deleteSessionNote(id: string): Promise<unknown> {
    const db = assertReady();
    return unwrap(await db.from('session_notes').delete().eq('id', id));
  },

  async addAiConsult(payload: Partial<AiConsult>): Promise<AiConsult> {
    const db = assertReady();
    return unwrap(await db.from('ai_consults').insert(payload).select('*').single());
  },

  async addAppointment(payload: Partial<Appointment>): Promise<Appointment> {
    const db = assertReady();
    return unwrap(await db.from('appointments').insert(payload).select('*').single());
  },

  async updateAppointment(id: string, payload: Partial<Appointment>): Promise<Appointment> {
    const db = assertReady();
    return unwrap(await db.from('appointments').update(payload).eq('id', id).select('*').single());
  },

  async getClinicStats(): Promise<ClinicStats> {
    const db = assertReady();

    const { count: totalPatients, error: pError } = await db
      .from('patients')
      .select('*', { count: 'exact', head: true });
    if (pError) throw pError;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const { count: recentSessions, error: sError } = await db
      .from('session_notes')
      .select('*', { count: 'exact', head: true })
      .gte('session_date', thirtyDaysAgo.toISOString().split('T')[0]);
    if (sError) throw sError;

    const { count: upcomingAppointments, error: aError } = await db
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .gte('starts_at', new Date().toISOString())
      .eq('status', 'scheduled');
    if (aError) throw aError;

    const { data: latestNotes, error: lnError } = await db
      .from('session_notes')
      .select('id, session_number, session_date, patients(full_name)')
      .order('created_at', { ascending: false })
      .limit(5);
    if (lnError) throw lnError;

    return {
      totalPatients: totalPatients || 0,
      recentSessions: recentSessions || 0,
      upcomingAppointments: upcomingAppointments || 0,
      // Supabase types the nested patients join as an array even for many-to-one
      // relations; we coerce to the runtime shape we actually return.
      latestActivity: (latestNotes ?? []) as unknown as ClinicStats['latestActivity']
    };
  },

  buildTimeline(record: ClinicalRecord | null | undefined): TimelineEntry[] {
    const evaluations: TimelineEntry[] = (record?.evaluations || []).map((item) => ({
      id: item.id,
      type: 'evaluation',
      label: 'Valoracion inicial',
      date: item.evaluation_date || item.created_at || new Date(0).toISOString(),
      description: item.prognosis || item.red_flags || 'Valoracion registrada',
      payload: item
    }));

    const notes: TimelineEntry[] = (record?.session_notes || []).map((item) => ({
      id: item.id,
      type: 'session_note',
      label: `Sesion #${item.session_number}`,
      date: item.session_date || item.created_at || new Date(0).toISOString(),
      description: item.eva != null ? `EVA ${item.eva}/10` : 'Nota de sesion',
      payload: item
    }));

    const consults: TimelineEntry[] = (record?.ai_consults || []).map((item) => ({
      id: item.id,
      type: 'ai_consult',
      label: `IA: ${item.type}`,
      date: item.created_at || new Date(0).toISOString(),
      description: item.validated ? 'Validada' : 'Pendiente de validacion',
      payload: item
    }));

    const followUps: TimelineEntry[] = (record?.follow_ups || []).map((item) => ({
      id: item.id,
      type: 'follow_up',
      label: `Seguimiento dia ${item.day_number}`,
      date: item.scheduled_date || item.created_at || new Date(0).toISOString(),
      description: item.status || 'Seguimiento',
      payload: item
    }));

    const appointments: TimelineEntry[] = (record?.appointments || []).map((item) => ({
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
