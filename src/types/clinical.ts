export type PatientStatus = 'En tratamiento' | 'Alta' | 'Seguimiento' | 'Inactivo';
export type Sex = '' | 'M' | 'F' | 'Otro';

export interface Patient {
  id: string;
  full_name: string | null;
  phone?: string | null;
  email?: string | null;
  sex?: Sex | null;
  status?: PatientStatus | null;
  birth_date?: string | null;
  occupation?: string | null;
  medical_diagnosis?: string | null;
  functional_diagnosis?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface SessionNote {
  id: string;
  patient_id: string;
  therapist_id?: string | null;
  session_number: number;
  session_date?: string | null;
  raw_text: string;
  eva?: number | null;
  created_at?: string;
}

export interface EvaluationSections {
  patient_identity?: Record<string, unknown> | null;
  history?: Record<string, unknown> | null;
  consultation?: {
    medical_diagnosis?: string | null;
    reason?: string | null;
    clinical_history?: string | null;
  } | null;
  pain?: {
    location?: string | null;
    type?: string | null;
    intensity?: number | null;
    aggravating_factors?: string | null;
    easing_factors?: string | null;
  } | null;
  physical_exam?: Record<string, unknown> | null;
}

export interface Evaluation {
  id: string;
  patient_id: string;
  therapist_id?: string | null;
  evaluation_date?: string | null;
  eva_initial?: number | null;
  red_flags?: string | null;
  prognosis?: string | null;
  medical_diagnosis?: string | null;
  sections?: EvaluationSections;
  created_at?: string;
}

export interface AiConsult {
  id: string;
  patient_id: string;
  therapist_id?: string | null;
  type: string;
  input_text?: string | null;
  output_text?: string | null;
  validated?: boolean;
  validation_notes?: string | null;
  created_at?: string;
}

export interface FollowUp {
  id: string;
  patient_id: string;
  day_number: number;
  scheduled_date?: string | null;
  status?: string | null;
  created_at?: string;
}

export interface Appointment {
  id: string;
  patient_id?: string | null;
  title?: string | null;
  description?: string | null;
  starts_at: string;
  ends_at?: string | null;
  status?: string | null;
  sync_status?: string | null;
  google_html_link?: string | null;
  google_event_id?: string | null;
  created_at?: string;
}

export interface ClinicalRecord extends Patient {
  session_notes?: SessionNote[];
  evaluations?: Evaluation[];
  ai_consults?: AiConsult[];
  follow_ups?: FollowUp[];
  appointments?: Appointment[];
}

export interface TimelineEntry {
  id: string;
  type: 'evaluation' | 'session_note' | 'ai_consult' | 'follow_up' | 'appointment';
  label: string;
  date: string;
  description: string;
  payload: unknown;
}

export type ValidationErrors<T> = Partial<Record<keyof T | string, string>>;

type ClinicStatsPatientRef = { full_name: string | null };

export interface ClinicStatsActivityItem {
  id: string;
  // Titulo de la cita (o tipo de sesion) tal como viene del calendario.
  title: string;
  // Fecha/hora de inicio de la cita (ISO). Se formatea en la vista.
  starts_at: string | null;
  session_type: string | null;
  // Supabase devuelve la relacion `patients(full_name)` como arreglo cuando el
  // cliente no esta tipado con el esquema; admitimos ambas formas.
  patients?: ClinicStatsPatientRef | ClinicStatsPatientRef[] | null;
}

export interface ClinicStats {
  totalPatients: number;
  recentSessions: number;
  upcomingAppointments: number;
  latestActivity: ClinicStatsActivityItem[];
}
