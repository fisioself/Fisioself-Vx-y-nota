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
  patient_id: string;
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
  nextAppt: FollowUpRow['nextAppointment']
): 'ok' | 'warning' | 'critical' {
  // ok if there is an upcoming appointment within the next 14 days
  if (nextAppt) {
    const now = new Date();
    const apptDate = new Date(nextAppt.starts_at);
    const daysUntil = Math.floor((apptDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntil <= 14) return 'ok';
  }
  if (daysSince !== null && daysSince < 14) return 'ok';
  if (daysSince !== null && daysSince <= 30) return 'warning';
  return 'critical'; // > 30 days or no contact ever, and no upcoming appt in 14 days
}

// Sort priority: today group first (by appointment time), then critical → warning → ok (alphabetical within each).
const ALERT_ORDER: Record<'critical' | 'warning' | 'ok', number> = {
  critical: 0,
  warning: 1,
  ok: 2
};

export const seguimientosApi = {
  async getFollowUps(): Promise<FollowUpRow[]> {
    const db = assertSupabase();

    // 1. Patients in active follow-up statuses
    const { data: patients, error: pErr } = await db
      .from('patients')
      .select('id, full_name, phone, status, medical_diagnosis')
      .in('status', ['En tratamiento', 'Seguimiento'])
      .is('deleted_at', null);

    if (pErr) throw pErr;
    if (!patients || patients.length === 0) return [];

    const patientIds = (patients as PatientRow[]).map((p) => p.id);

    // 2. Appointments: past 90 days + next 60 days (contact = any past non-cancelled appt)
    const past90 = new Date();
    past90.setDate(past90.getDate() - 90);
    const future60 = new Date();
    future60.setDate(future60.getDate() + 60);

    const { data: appointments, error: aErr } = await db
      .from('appointments')
      .select('id, patient_id, starts_at, session_type, title, status')
      .in('patient_id', patientIds)
      .gte('starts_at', past90.toISOString())
      .lte('starts_at', future60.toISOString())
      .neq('status', 'cancelled')
      .order('starts_at', { ascending: true });

    if (aErr) throw aErr;

    // 3. Session notes — only needed for last EVA score, not for contact date
    const { data: notes, error: nErr } = await db
      .from('session_notes')
      .select('id, patient_id, eva')
      .in('patient_id', patientIds)
      .not('eva', 'is', null)
      .order('created_at', { ascending: false });

    if (nErr) throw nErr;

    const apptRows = (appointments ?? []) as AppointmentRow[];
    const noteRows = (notes ?? []) as SessionNoteRow[];
    const now = new Date().toISOString();

    // Build maps
    const apptByPatient = new Map<string, AppointmentRow[]>();
    for (const a of apptRows) {
      const list = apptByPatient.get(a.patient_id) ?? [];
      list.push(a);
      apptByPatient.set(a.patient_id, list);
    }

    // First EVA per patient (notes ordered desc by created_at)
    const lastEvaByPatient = new Map<string, number>();
    for (const n of noteRows) {
      if (!lastEvaByPatient.has(n.patient_id) && n.eva != null) {
        lastEvaByPatient.set(n.patient_id, n.eva);
      }
    }

    // Join
    const result: FollowUpRow[] = (patients as PatientRow[]).map((p) => {
      const appts = apptByPatient.get(p.id) ?? [];
      const pastAppts = appts.filter((a) => a.starts_at < now);
      const futureAppts = appts.filter((a) => a.starts_at >= now);
      const todayAppts = appts.filter((a) => isToday(a.starts_at));

      // Contact = most recent past appointment (user decision: no session-note dates)
      const lastPastAppt = pastAppts.at(-1) ?? null; // ascending order → last = most recent
      const lastContactDate = lastPastAppt?.starts_at ?? null;
      const daysSinceContact = calcDaysSince(lastContactDate);

      const nextAppt = futureAppts[0] ?? null;
      const nextAppointment = nextAppt
        ? { starts_at: nextAppt.starts_at, session_type: nextAppt.session_type, title: nextAppt.title }
        : null;

      // Today's appointment: prefer the next future one today, else the latest past one today
      const futureTodayAppts = todayAppts.filter((a) => a.starts_at >= now);
      const todayApptRaw = futureTodayAppts[0] ?? todayAppts.at(-1) ?? null;
      const todayAppointment = todayApptRaw
        ? { starts_at: todayApptRaw.starts_at, session_type: todayApptRaw.session_type, title: todayApptRaw.title }
        : null;

      const lastEva = lastEvaByPatient.get(p.id) ?? null;
      const alertLevel = getAlertLevel(daysSinceContact, nextAppointment);

      return {
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
      };
    });

    // Sort: today first (by appointment time ASC), then critical → warning → ok (alphabetical within each)
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
