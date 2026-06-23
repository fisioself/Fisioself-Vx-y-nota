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
  nextAppointment: {
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
  session_date: string | null;
  created_at: string | null;
  eva: number | null;
}

function calcDaysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function maxDate(a: string | null, b: string | null): string | null {
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

function getAlertLevel(
  daysSince: number | null,
  nextAppt: FollowUpRow['nextAppointment']
): 'ok' | 'warning' | 'critical' {
  // Check if there's an upcoming appointment within 14 days
  let upcomingIn14 = false;
  if (nextAppt) {
    const now = new Date();
    const apptDate = new Date(nextAppt.starts_at);
    const daysUntil = Math.floor((apptDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    upcomingIn14 = daysUntil <= 14;
  }

  if (upcomingIn14 || (daysSince !== null && daysSince < 14)) {
    return 'ok';
  }
  if (daysSince !== null && daysSince >= 14 && daysSince <= 30) {
    return 'warning';
  }
  // daysSince > 30 OR null (never contacted), and no upcoming appt in 14 days
  return 'critical';
}

const ALERT_ORDER: Record<'critical' | 'warning' | 'ok', number> = {
  critical: 0,
  warning: 1,
  ok: 2
};

export const seguimientosApi = {
  async getFollowUps(): Promise<FollowUpRow[]> {
    const db = assertSupabase();

    // 1. Fetch active patients
    const { data: patients, error: pErr } = await db
      .from('patients')
      .select('id, full_name, phone, status, medical_diagnosis')
      .in('status', ['En tratamiento', 'Seguimiento'])
      .is('deleted_at', null);

    if (pErr) throw pErr;
    if (!patients || patients.length === 0) return [];

    const patientIds = (patients as PatientRow[]).map((p) => p.id);

    // 2. Fetch appointments in range [-90 days, +60 days]
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

    // 3. Fetch session notes for those patients (all, no date limit)
    const { data: notes, error: nErr } = await db
      .from('session_notes')
      .select('id, patient_id, session_date, created_at, eva')
      .in('patient_id', patientIds)
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

    // Notes are already ordered desc by created_at; take first per patient
    const lastNoteByPatient = new Map<string, SessionNoteRow>();
    for (const n of noteRows) {
      if (!lastNoteByPatient.has(n.patient_id)) {
        lastNoteByPatient.set(n.patient_id, n);
      }
    }

    // Join
    const result: FollowUpRow[] = (patients as PatientRow[]).map((p) => {
      const appts = apptByPatient.get(p.id) ?? [];
      const pastAppts = appts.filter((a) => a.starts_at < now);
      const futureAppts = appts.filter((a) => a.starts_at >= now);

      const lastPastAppt = pastAppts.at(-1) ?? null; // last in ascending order = most recent past
      const nextAppt = futureAppts[0] ?? null; // first future

      const lastNote = lastNoteByPatient.get(p.id) ?? null;
      const noteDate = lastNote ? (lastNote.session_date ?? lastNote.created_at) : null;
      const lastContactDate = maxDate(noteDate, lastPastAppt?.starts_at ?? null);

      const daysSinceContact = calcDaysSince(lastContactDate);
      const lastEva = lastNote?.eva ?? null;

      const nextAppointment = nextAppt
        ? {
            starts_at: nextAppt.starts_at,
            session_type: nextAppt.session_type,
            title: nextAppt.title
          }
        : null;

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
        alertLevel
      };
    });

    // Sort: critical first, warning, ok; alphabetical within group
    result.sort((a, b) => {
      const levelDiff = ALERT_ORDER[a.alertLevel] - ALERT_ORDER[b.alertLevel];
      if (levelDiff !== 0) return levelDiff;
      return (a.full_name ?? '').localeCompare(b.full_name ?? '', 'es');
    });

    return result;
  }
};
