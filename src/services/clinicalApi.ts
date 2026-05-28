import { assertSupabase } from '../lib/supabaseClient';
import type { TablesInsert, TablesUpdate } from '../types/supabase';
import type {
  Patient,
  SessionNote,
  Evaluation,
  AiConsult,
  Appointment,
  ClinicalRecord,
  TimelineEntry,
  ClinicStats
} from '../types/clinical';

// Re-export para consumidores que historicamente importaron estos tipos
// desde el servicio. La fuente unica de verdad vive en types/clinical.ts.
export type { Patient, SessionNote } from '../types/clinical';

const unwrap = <T>({ data, error }: { data: unknown; error: unknown }): T => {
  if (error) throw error;
  return data as T;
};

const sortByDateDesc = (a: TimelineEntry, b: TimelineEntry): number =>
  new Date(b.date).getTime() - new Date(a.date).getTime();

export const clinicalApi = {
  async listPatients(): Promise<Patient[]> {
    const db = assertSupabase();
    return unwrap(await db.from('patients').select('*').order('updated_at', { ascending: false }));
  },

  async createPatient(payload: Partial<Patient>): Promise<Patient> {
    const db = assertSupabase();
    return unwrap(
      await db
        .from('patients')
        .insert(payload as TablesInsert<'patients'>)
        .select('*')
        .single()
    );
  },

  async updatePatient(id: string, payload: Partial<Patient>): Promise<Patient> {
    const db = assertSupabase();
    return unwrap(
      await db
        .from('patients')
        .update(payload as TablesUpdate<'patients'>)
        .eq('id', id)
        .select('*')
        .single()
    );
  },

  async deletePatient(id: string): Promise<void> {
    const db = assertSupabase();
    return unwrap(await db.from('patients').delete().eq('id', id));
  },

  async getPatient(id: string): Promise<ClinicalRecord> {
    const db = assertSupabase();
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
    const db = assertSupabase();
    return unwrap(
      await db
        .from('evaluations')
        .insert(payload as TablesInsert<'evaluations'>)
        .select('*')
        .single()
    );
  },

  async updateEvaluation(id: string, payload: Partial<Evaluation>): Promise<Evaluation> {
    const db = assertSupabase();
    return unwrap(
      await db
        .from('evaluations')
        .update(payload as TablesUpdate<'evaluations'>)
        .eq('id', id)
        .select('*')
        .single()
    );
  },

  async addSessionNote(payload: Partial<SessionNote>): Promise<SessionNote> {
    const db = assertSupabase();
    const response = await db
      .from('session_notes')
      .insert(payload as TablesInsert<'session_notes'>)
      .select('*')
      .single();
    if (response.error?.code === '23505') {
      throw new Error(
        'Ya existe una nota con ese numero de sesion. Actualiza el expediente e intenta de nuevo.'
      );
    }
    return unwrap(response);
  },

  async updateSessionNote(id: string, payload: Partial<SessionNote>): Promise<SessionNote> {
    const db = assertSupabase();
    const response = await db
      .from('session_notes')
      .update(payload as TablesUpdate<'session_notes'>)
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
    const db = assertSupabase();
    return unwrap(await db.from('session_notes').delete().eq('id', id));
  },

  async addAiConsult(payload: Partial<AiConsult>): Promise<AiConsult> {
    const db = assertSupabase();
    return unwrap(
      await db
        .from('ai_consults')
        .insert(payload as TablesInsert<'ai_consults'>)
        .select('*')
        .single()
    );
  },

  async addAppointment(payload: Partial<Appointment>): Promise<Appointment> {
    const db = assertSupabase();
    return unwrap(
      await db
        .from('appointments')
        .insert(payload as TablesInsert<'appointments'>)
        .select('*')
        .single()
    );
  },

  async updateAppointment(id: string, payload: Partial<Appointment>): Promise<Appointment> {
    const db = assertSupabase();
    return unwrap(
      await db
        .from('appointments')
        .update(payload as TablesUpdate<'appointments'>)
        .eq('id', id)
        .select('*')
        .single()
    );
  },

  async getClinicStats(): Promise<ClinicStats> {
    const db = assertSupabase();

    // 1. Total de pacientes
    const { count: totalPatients, error: pError } = await db
      .from('patients')
      .select('*', { count: 'exact', head: true });
    if (pError) throw pError;

    // 2. Sesiones de los ultimos 30 dias
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const { count: recentSessions, error: sError } = await db
      .from('session_notes')
      .select('*', { count: 'exact', head: true })
      .gte('session_date', thirtyDaysAgo.toISOString().split('T')[0]);
    if (sError) throw sError;

    // 3. Citas proximas
    const { count: upcomingAppointments, error: aError } = await db
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .gte('starts_at', new Date().toISOString())
      .eq('status', 'scheduled');
    if (aError) throw aError;

    // 4. Actividad reciente (ultimas 5 notas)
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
      latestActivity: (latestNotes || []) as ClinicStats['latestActivity']
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
      description:
        item.eva !== null && item.eva !== undefined ? `EVA ${item.eva}/10` : 'Nota de sesion',
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
