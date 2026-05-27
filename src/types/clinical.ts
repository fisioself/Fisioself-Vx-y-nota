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
  session_number: number;
  session_date?: string | null;
  raw_text: string;
  eva?: number | null;
  created_at?: string;
}

export interface EvaluationSections {
  patient_identity?: Record<string, unknown>;
  history?: Record<string, unknown>;
  consultation?: { medical_diagnosis?: string; reason?: string; clinical_history?: string };
  pain?: {
    location?: string;
    type?: string;
    intensity?: number;
    aggravating_factors?: string;
    easing_factors?: string;
  };
  physical_exam?: Record<string, unknown>;
}

export interface Evaluation {
  id: string;
  patient_id: string;
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
  type: string;
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

export interface ClinicStats {
  totalPatients: number;
  recentSessions: number;
  upcomingAppointments: number;
  latestActivity: Array<{
    id: string;
    session_number: number;
    session_date: string | null;
    patients: { full_name: string } | null;
  }>;
}
