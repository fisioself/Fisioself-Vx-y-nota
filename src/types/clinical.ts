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
  // Borrado lógico: si tiene valor, el paciente está en la papelera.
  deleted_at?: string | null;
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

export interface EvaluationZoneRom {
  movement?: string | null;
  type?: string | null; // 'Activo' | 'Pasivo'
  range?: string | null;
  degrees?: string | null; // grados del lado afectado
  degrees_healthy?: string | null; // grados del lado sano (comparativo bilateral)
  pain?: string | null; // 'Sí' | 'No'
  notes?: string | null;
}

export interface EvaluationZoneStrength {
  muscle?: string | null;
  daniels?: string | null;
  pain?: string | null; // 'Sí' | 'No'
  notes?: string | null;
}

export interface EvaluationZoneTest {
  name?: string | null;
  group?: string | null;
  result?: string | null;
  notes?: string | null;
}

export interface EvaluationZone {
  zone?: string | null; // etiqueta legible de la zona (o id del catálogo)
  zone_id?: string | null;
  pain?: {
    location?: string | null;
    intensity?: number | string | null;
    type?: string | null;
    aggravating_factors?: string | null;
    easing_factors?: string | null;
  } | null;
  movement_ranges?: EvaluationZoneRom[];
  muscle_strength?: EvaluationZoneStrength[];
  special_tests?: EvaluationZoneTest[];
  palpation?: string | null;
}

// Punto marcado en el mapa corporal de dolor. x/y son porcentajes (0-100)
// relativos al lienzo de la vista (frontal o posterior).
export interface PainPoint {
  view: 'front' | 'back';
  x: number;
  y: number;
}

export interface EvaluationSections {
  patient_identity?: Record<string, unknown> | null;
  history?: Record<string, unknown> | null;
  consultation?: {
    medical_diagnosis?: string | null;
    reason?: string | null;
    clinical_history?: string | null;
    symptom_onset_date?: string | null;
    symptom_classification?: string | null;
    injury_mechanism?: string | null;
    pain_mechanism?: string | null; // Nociceptivo / Neuropático / Nociplástico / Mixto
  } | null;
  pain?: {
    location?: string | null;
    type?: string | null;
    intensity?: number | null;
    aggravating_factors?: string | null;
    easing_factors?: string | null;
  } | null;
  // Valoración general (exploración física global): signos vitales, postura, marcha.
  general_assessment?: {
    blood_pressure?: string | null;
    heart_rate?: string | null;
    respiratory_rate?: string | null;
    oxygen_saturation?: string | null;
    // Candado de calidad del oxímetro: ¿curva pletismográfica estable? Solo se
    // persiste cuando hay valor de SpO₂. `spo2_quality_note` guarda la causa de
    // una lectura poco confiable (manos frías, esmalte, etc.).
    spo2_reliable?: boolean | null;
    spo2_quality_note?: string | null;
    inspection?: string | null;
    posture?: string | null;
    gait?: string | null;
  } | null;
  // Banderas rojas estructuradas: lista marcada + texto libre.
  red_flags?: {
    items?: string[];
    other?: string | null;
  } | null;
  // Banderas amarillas (factores psicosociales): lista marcada + texto libre.
  yellow_flags?: {
    items?: string[];
    other?: string | null;
  } | null;
  // Cuestionarios funcionales (PROMs): escala aplicada y puntuación inicial.
  functional_scales?: {
    name?: string | null;
    score?: string | null;
    notes?: string | null;
  } | null;
  // Mapa corporal de dolor: puntos marcados sobre la silueta (frontal/posterior).
  pain_map?: {
    points?: PainPoint[];
  } | null;
  physical_exam?: Record<string, unknown> | null; // legado (tablas planas globales)
  // Valoración por zonas específicas (estructura nueva).
  zones?: EvaluationZone[];
  // Conclusión y diagnóstico.
  conclusion?: {
    diagnosis?: string | null;
    // Pronóstico fisioterapéutico (expectativa y tiempo de recuperación).
    prognosis?: string | null;
    // Objetivos unificados (corto/mediano/largo en un solo texto). Los tres
    // campos previos se conservan solo para leer valoraciones antiguas.
    objectives?: string | null;
    objectives_short?: string | null;
    objectives_mid?: string | null;
    objectives_long?: string | null;
    treatment_plan?: string | null;
  } | null;
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
  session_type?: string | null;
  color_id?: string | null;
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
  // Sesiones y valoraciones del MES EN CURSO (mes calendario), con la regla
  // canonica de Finanzas: excluye canceladas y cortesias, y separa la
  // valoracion (color morado 9/1) de la sesion de tratamiento.
  monthSessions: number;
  monthValoraciones: number;
  upcomingAppointments: number;
  latestActivity: ClinicStatsActivityItem[];
}
