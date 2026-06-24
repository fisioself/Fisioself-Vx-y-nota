import { assertSupabase } from '../lib/supabaseClient';
import { trackEvent } from '../lib/analytics';
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

// Normaliza para ordenar: una fecha solo-fecha (YYYY-MM-DD) se parsea como
// medianoche UTC y quedaría intercalada de forma rara entre los created_at
// (timestamps reales). La llevamos a mediodía local (igual que el display del
// timeline) para que los eventos del mismo día queden agrupados de forma estable.
const toTime = (d: string): number =>
  new Date(/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T12:00:00` : d).getTime();

const sortByDateDesc = (a: TimelineEntry, b: TimelineEntry): number =>
  toTime(b.date) - toTime(a.date);

export const clinicalApi = {
  async listPatients(): Promise<Patient[]> {
    const db = assertSupabase();
    return unwrap(await db.from('patients').select('*').order('updated_at', { ascending: false }));
  },

  async listPatientsToday(): Promise<Patient[]> {
    const db = assertSupabase();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const { data, error } = await db
      .from('appointments')
      .select('patient_id, starts_at, patients(*)')
      .gte('starts_at', today.toISOString())
      .lt('starts_at', tomorrow.toISOString())
      .neq('status', 'cancelled')
      .order('starts_at', { ascending: true });

    if (error) throw error;

    const seen = new Set<string>();
    const patients: Patient[] = [];
    for (const row of data || []) {
      if (row.patient_id && !seen.has(row.patient_id)) {
        seen.add(row.patient_id);
        const p = Array.isArray(row.patients) ? row.patients[0] : row.patients;
        if (p) patients.push(p as Patient);
      }
    }
    return patients;
  },

  async searchPatients(query: string): Promise<Patient[]> {
    const db = assertSupabase();
    const q = query.trim();
    if (!q) return [];
    // search_patients_unaccent usa unaccent() para encontrar pacientes aunque
    // el usuario escriba sin acentos (ej. "antonio perez" → "Antonio Pérez").
    const { data, error } = await (
      db.rpc as unknown as (
        name: string,
        args: Record<string, unknown>
      ) => Promise<{ data: unknown; error: unknown }>
    )('search_patients_unaccent', { p_query: q });
    if (error) throw error;
    return (data ?? []) as Patient[];
  },

  async createPatient(payload: Partial<Patient>): Promise<Patient> {
    const db = assertSupabase();
    const result = unwrap<Patient>(
      await db
        .from('patients')
        .insert(payload as TablesInsert<'patients'>)
        .select('*')
        .single()
    );
    trackEvent('patient_created');
    return result;
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

  // Borrado lógico: marca deleted_at en vez de eliminar la fila. El paciente
  // desaparece de toda lectura (la política RLS oculta deleted_at IS NOT NULL)
  // pero su expediente se conserva y puede recuperarse desde la papelera.
  //
  // Se usa el RPC `delete_patient` (SECURITY DEFINER) en vez de un UPDATE
  // directo: al poner deleted_at, la nueva fila deja de cumplir la política
  // SELECT (deleted_at IS NULL) y Postgres rechazaba el UPDATE con
  // "new row violates row-level security policy". El RPC valida permisos
  // (admin + acceso a la clínica) y hace el soft-delete sin esa contradicción.
  async deletePatient(id: string): Promise<void> {
    const db = assertSupabase();
    const { error } = await db.rpc('delete_patient', { patient_id: id });
    if (error) throw error;
  },

  // Papelera: pacientes borrados de la clínica (solo admin, vía RPC con
  // SECURITY DEFINER que verifica is_admin() internamente).
  async listDeletedPatients(): Promise<Patient[]> {
    const db = assertSupabase();
    const { data, error } = await (
      db.rpc as unknown as (name: string) => Promise<{ data: unknown; error: unknown }>
    )('list_deleted_patients');
    if (error) throw error;
    return (data ?? []) as Patient[];
  },

  // Restaura un paciente borrado (solo admin).
  async restorePatient(id: string): Promise<void> {
    const db = assertSupabase();
    const { error } = await (
      db.rpc as unknown as (
        name: string,
        args: Record<string, unknown>
      ) => Promise<{ data: unknown; error: unknown }>
    )('restore_patient', { p_id: id });
    if (error) throw error;
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
    const result = unwrap<Evaluation>(
      await db
        .from('evaluations')
        .insert(payload as TablesInsert<'evaluations'>)
        .select('*')
        .single()
    );
    trackEvent('evaluation_added');
    return result;
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

  // Próximo número de sesión para un paciente (max + 1). Liviano: solo lee la
  // columna session_number. Usado por el cobro desde la agenda.
  async getNextSessionNumber(patientId: string): Promise<number> {
    const db = assertSupabase();
    const { data, error } = await db
      .from('session_notes')
      .select('session_number')
      .eq('patient_id', patientId)
      .order('session_number', { ascending: false })
      .limit(1);
    if (error) throw error;
    const max = data && data.length ? Number(data[0].session_number) : 0;
    return (Number.isFinite(max) ? max : 0) + 1;
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
    const result = unwrap<SessionNote>(response);
    trackEvent('session_note_saved', { session_number: payload.session_number ?? undefined });
    return result;
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
    const result = unwrap<AiConsult>(
      await db
        .from('ai_consults')
        .insert(payload as TablesInsert<'ai_consults'>)
        .select('*')
        .single()
    );
    trackEvent('ai_consult_saved', { validated: payload.validated ?? undefined });
    return result;
  },

  async addAppointment(payload: Partial<Appointment>): Promise<Appointment> {
    const db = assertSupabase();
    const result = unwrap<Appointment>(
      await db
        .from('appointments')
        .insert(payload as TablesInsert<'appointments'>)
        .select('*')
        .single()
    );
    trackEvent('appointment_scheduled');
    return result;
  },

  // Elimina una cita de la app Y de Google Calendar a la vez. Lo hace vía edge
  // function porque borrar el evento en Google requiere el token del servidor;
  // si solo se borrara localmente, el cron de importación la recrearía.
  async deleteAppointmentFully(appointmentId: string): Promise<void> {
    const db = assertSupabase();
    const { data, error } = await db.functions.invoke('google-calendar-delete', {
      body: { appointment_id: appointmentId }
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
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

    // 2. Sesiones y valoraciones del MES EN CURSO. Usamos la MISMA fuente que
    //    Finanzas (finance_appt_stats) para que los numeros coincidan en toda la
    //    app: esa funcion excluye canceladas y cortesias y separa la valoracion
    //    (color morado) de la sesion de tratamiento. Antes el dashboard contaba
    //    TODAS las citas como "sesiones" (incluyendo valoraciones y cortesias),
    //    lo que inflaba el numero y no cuadraba con Finanzas.
    const { data: apptStats, error: sError } = await db.rpc('finance_appt_stats', {
      p_months_back: 1
    });
    if (sError) throw sError;
    const currentMonth = (
      apptStats as { currentMonth?: { sessions?: number; valoraciones?: number } } | null
    )?.currentMonth;
    const monthSessions = currentMonth?.sessions ?? 0;
    const monthValoraciones = currentMonth?.valoraciones ?? 0;

    // 3. Citas proximas
    const { count: upcomingAppointments, error: aError } = await db
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .gte('starts_at', new Date().toISOString())
      .eq('status', 'scheduled');
    if (aError) throw aError;

    // 4. Actividad reciente (ultimas 5 citas atendidas del calendario)
    const { data: latestAppts, error: lnError } = await db
      .from('appointments')
      .select('id, title, starts_at, session_type, patients(full_name)')
      .lte('starts_at', new Date().toISOString())
      .neq('status', 'cancelled')
      .order('starts_at', { ascending: false })
      .limit(5);
    if (lnError) throw lnError;

    return {
      totalPatients: totalPatients || 0,
      monthSessions,
      monthValoraciones,
      upcomingAppointments: upcomingAppointments || 0,
      latestActivity: (latestAppts || []) as ClinicStats['latestActivity']
    };
  },

  buildTimeline(record: ClinicalRecord | null | undefined): TimelineEntry[] {
    const evaluations: TimelineEntry[] = (record?.evaluations || []).map((item) => ({
      id: item.id,
      type: 'evaluation',
      label: 'Valoracion inicial',
      date: item.evaluation_date || item.created_at || new Date(0).toISOString(),
      description: (() => {
        const base = item.prognosis || item.red_flags || 'Valoracion registrada';
        const yf = (item.sections as { yellow_flags?: { items?: string[] } } | undefined)
          ?.yellow_flags?.items;
        return yf?.length ? `${base} · ${yf.length} bandera(s) amarilla(s)` : base;
      })(),
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
