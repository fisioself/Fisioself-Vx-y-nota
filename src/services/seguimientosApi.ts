import { assertSupabase } from '../lib/supabaseClient';

export interface FollowUpRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  status: string | null;
  medical_diagnosis: string | null;
  lastContactDate: string | null;
  daysSinceContact: number | null;
  lastEva: number | null;
  /** Next future appointment (or null if none). */
  nextAppointment: {
    starts_at: string;
    session_type: string | null;
    title: string | null;
  } | null;
  /** Any appointment (past or future) scheduled for today. Used for the "Hoy" group. */
  todayAppointment: {
    starts_at: string;
    session_type: string | null;
    title: string | null;
  } | null;
  alertLevel: 'ok' | 'warning' | 'critical';
}

interface PatientRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  status: string | null;
  medical_diagnosis: string | null;
}

interface AppointmentRow {
  id: string;
  patient_id: string | null;
  starts_at: string;
  session_type: string | null;
  title: string | null;
  status: string | null;
}

interface SessionNoteRow {
  id: string;
  patient_id: string;
  eva: number | null;
}

// Cuántos días hacia atrás se considera a un paciente "activo" para seguimiento.
const ACTIVE_WINDOW_DAYS = 60;
const FUTURE_WINDOW_DAYS = 60;

function calcDaysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function getAlertLevel(
  daysSince: number | null,
  hasFutureAppt: boolean
): 'ok' | 'warning' | 'critical' {
  if (hasFutureAppt) return 'ok'; // tiene próxima cita agendada
  if (daysSince === null) return 'ok'; // sin citas pasadas (solo hoy/futuro) → al día
  if (daysSince < 14) return 'ok';
  if (daysSince <= 30) return 'warning';
  return 'critical'; // 31–60 días sin cita y sin cita futura
}

// Orden: hoy primero (por hora), luego crítico → en riesgo → al día (alfabético dentro de cada grupo).
const ALERT_ORDER: Record<'critical' | 'warning' | 'ok', number> = {
  critical: 0,
  warning: 1,
  ok: 2
};

export const seguimientosApi = {
  async getFollowUps(): Promise<FollowUpRow[]> {
    const db = assertSupabase();

    // 1. Citas en la ventana [-60d, +60d], no canceladas. La lista de seguimiento
    //    se construye a partir de la actividad real de citas, no del estado del
    //    paciente (en esta clínica casi todos quedan en "En valoración").
    const past = new Date();
    past.setDate(past.getDate() - ACTIVE_WINDOW_DAYS);
    const future = new Date();
    future.setDate(future.getDate() + FUTURE_WINDOW_DAYS);

    const { data: appointments, error: aErr } = await db
      .from('appointments')
      .select('id, patient_id, starts_at, session_type, title, status')
      .gte('starts_at', past.toISOString())
      .lte('starts_at', future.toISOString())
      .neq('status', 'cancelled')
      .not('patient_id', 'is', null)
      .order('starts_at', { ascending: true });

    if (aErr) throw aErr;

    const apptRows = (appointments ?? []) as AppointmentRow[];
    const patientIds = Array.from(
      new Set(apptRows.map((a) => a.patient_id).filter((id): id is string => id != null))
    );
    if (patientIds.length === 0) return [];

    // 2. Datos de esos pacientes (excluye los borrados).
    const { data: patients, error: pErr } = await db
      .from('patients')
      .select('id, full_name, phone, status, medical_diagnosis')
      .in('id', patientIds)
      .is('deleted_at', null);

    if (pErr) throw pErr;
    const patientRows = (patients ?? []) as PatientRow[];
    const patientById = new Map(patientRows.map((p) => [p.id, p]));
    if (patientById.size === 0) return [];

    // 3. Notas de sesión — solo para el último EVA registrado.
    const { data: notes, error: nErr } = await db
      .from('session_notes')
      .select('id, patient_id, eva')
      .in('patient_id', Array.from(patientById.keys()))
      .not('eva', 'is', null)
      .order('created_at', { ascending: false });

    if (nErr) throw nErr;
    const noteRows = (notes ?? []) as SessionNoteRow[];

    const now = new Date().toISOString();

    // Agrupar citas por paciente (solo pacientes vivos).
    const apptByPatient = new Map<string, AppointmentRow[]>();
    for (const a of apptRows) {
      if (!a.patient_id || !patientById.has(a.patient_id)) continue;
      const list = apptByPatient.get(a.patient_id) ?? [];
      list.push(a);
      apptByPatient.set(a.patient_id, list);
    }

    // Primer EVA por paciente (notas ya ordenadas desc por created_at).
    const lastEvaByPatient = new Map<string, number>();
    for (const n of noteRows) {
      if (!lastEvaByPatient.has(n.patient_id) && n.eva != null) {
        lastEvaByPatient.set(n.patient_id, n.eva);
      }
    }

    const result: FollowUpRow[] = [];
    for (const [pid, appts] of apptByPatient) {
      const p = patientById.get(pid)!;
      const pastAppts = appts.filter((a) => a.starts_at < now);
      const futureAppts = appts.filter((a) => a.starts_at >= now);
      const todayAppts = appts.filter((a) => isToday(a.starts_at));

      const lastPastAppt = pastAppts.at(-1) ?? null; // orden asc → último = más reciente
      const lastContactDate = lastPastAppt?.starts_at ?? null;
      const daysSinceContact = calcDaysSince(lastContactDate);

      const nextAppt = futureAppts[0] ?? null;
      const nextAppointment = nextAppt
        ? {
            starts_at: nextAppt.starts_at,
            session_type: nextAppt.session_type,
            title: nextAppt.title
          }
        : null;

      // Cita de hoy: la próxima de hoy si la hay, si no la última de hoy.
      const futureTodayAppts = todayAppts.filter((a) => a.starts_at >= now);
      const todayApptRaw = futureTodayAppts[0] ?? todayAppts.at(-1) ?? null;
      const todayAppointment = todayApptRaw
        ? {
            starts_at: todayApptRaw.starts_at,
            session_type: todayApptRaw.session_type,
            title: todayApptRaw.title
          }
        : null;

      const lastEva = lastEvaByPatient.get(pid) ?? null;
      const alertLevel = getAlertLevel(daysSinceContact, nextAppointment !== null);

      result.push({
        id: p.id,
        full_name: p.full_name,
        phone: p.phone,
        status: p.status,
        medical_diagnosis: p.medical_diagnosis,
        lastContactDate,
        daysSinceContact,
        lastEva,
        nextAppointment,
        todayAppointment,
        alertLevel
      });
    }

    // Orden: hoy primero (por hora asc), luego crítico → en riesgo → al día (alfabético).
    result.sort((a, b) => {
      const aIsToday = a.todayAppointment ? 0 : 1;
      const bIsToday = b.todayAppointment ? 0 : 1;
      if (aIsToday !== bIsToday) return aIsToday - bIsToday;
      if (a.todayAppointment && b.todayAppointment) {
        return a.todayAppointment.starts_at.localeCompare(b.todayAppointment.starts_at);
      }
      const levelDiff = ALERT_ORDER[a.alertLevel] - ALERT_ORDER[b.alertLevel];
      if (levelDiff !== 0) return levelDiff;
      return (a.full_name ?? '').localeCompare(b.full_name ?? '', 'es');
    });

    return result;
  }
};
