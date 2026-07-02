// Tipos del formulario de valoración (datos en memoria del form).
import type { PainPoint } from '../../types/clinical';

export interface RomRow {
  movement: string;
  type: string; // 'Activo' | 'Pasivo'
  range: string;
  degrees: string; // lado afectado
  degrees_healthy: string; // lado sano (comparativo bilateral)
  pain: string; // 'Sí' | 'No'
  notes: string;
}
export interface StrengthRow {
  muscle: string;
  daniels: string;
  pain: string;
  notes: string;
}
// Resultado de una prueba especial, indexado por nombre de prueba del catálogo.
export interface TestResult {
  result: string;
  notes: string;
}

export interface ZoneFormData {
  zone_id: string;
  zone_label: string; // para zona "otra" (texto libre)
  pain_location: string;
  pain_intensity: string;
  pain_type: string;
  aggravating_factors: string;
  easing_factors: string;
  movement_ranges: RomRow[];
  muscle_strength: StrengthRow[];
  special_results: Record<string, TestResult>;
  palpation: string;
}

export interface EvaluationFormValues {
  // Datos generales
  full_name: string;
  birth_date: string;
  sex: string;
  admission_date: string;
  occupation: string;
  phone: string;
  emergency_contact: string;
  referred_by: string;
  therapist_name: string;
  // Antecedentes
  family_history: string;
  personal_history: string;
  surgical_history: string;
  current_medications: string;
  known_allergies: string;
  physical_activity: string;
  previous_imaging: string;
  // Motivo
  medical_diagnosis: string;
  consultation_reason: string;
  symptom_onset_date: string;
  symptom_classification: string;
  injury_mechanism: string;
  pain_mechanism: string;
  clinical_history: string;
  // Banderas rojas
  red_flags: string[];
  red_flags_other: string;
  // Banderas amarillas (factores psicosociales)
  yellow_flags: string[];
  yellow_flags_other: string;
  // Valoración general
  blood_pressure: string;
  heart_rate: string;
  respiratory_rate: string;
  oxygen_saturation: string;
  // Calidad de la lectura del oxímetro: 'Sí' (curva estable, default) | 'No'.
  // Solo aplica (y se guarda) cuando oxygen_saturation tiene valor.
  spo2_reliable: string;
  spo2_quality_note: string;
  general_inspection: string;
  posture: string;
  gait: string;
  // Zonas
  zones: ZoneFormData[];
  // Mapa corporal de dolor
  pain_points: PainPoint[];
  // Cuestionarios funcionales (PROMs)
  functional_scale_name: string;
  functional_scale_score: string;
  functional_scale_notes: string;
  // Conclusión
  // OJO: `prognosis` aquí guarda el DIAGNÓSTICO fisioterapéutico (nombre legado,
  // mapeado a conclusion.diagnosis y a la columna prognosis). El pronóstico real
  // (expectativa de recuperación) vive en `recovery_prognosis`.
  prognosis: string;
  recovery_prognosis: string;
  objectives: string;
  treatment_plan: string;
  // Ejercicios para casa en lenguaje del paciente (IA) → PDF "Plan del paciente".
  home_exercises: string;
}
