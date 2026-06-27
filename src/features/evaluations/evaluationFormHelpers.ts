// Helpers puros del formulario de valoración: conversión desde una Evaluation,
// valores por defecto y utilidades de saneo. Sin estado de React.
import { getLocalISODate } from '../../shared/dateUtils';
import type { Evaluation } from '../../types/clinical';
import type {
  EvaluationFormValues,
  ZoneFormData,
  RomRow,
  StrengthRow
} from './evaluationFormTypes';

export function evaluationToFormValues(ev: Evaluation): EvaluationFormValues {
  const s = ev.sections || {};
  const id = (s.patient_identity || {}) as Record<string, string | null | undefined>;
  const hist = (s.history || {}) as Record<string, string | null | undefined>;
  const c = s.consultation || {};
  const g = s.general_assessment || {};
  const rf = s.red_flags || {};
  const yf = s.yellow_flags || {};
  const fs = s.functional_scales || {};
  const cl = s.conclusion || {};

  const zones: ZoneFormData[] = (s.zones || []).map((zone) => ({
    zone_id: zone.zone_id || '',
    zone_label: zone.zone_id ? '' : zone.zone || '',
    pain_location: zone.pain?.location || '',
    pain_intensity: zone.pain?.intensity != null ? String(zone.pain.intensity) : '',
    pain_type: zone.pain?.type || '',
    aggravating_factors: zone.pain?.aggravating_factors || '',
    easing_factors: zone.pain?.easing_factors || '',
    movement_ranges: zone.movement_ranges?.length
      ? zone.movement_ranges.map((r) => ({
          movement: r.movement || '',
          type: r.type || '',
          range: r.range || '',
          degrees: r.degrees || '',
          degrees_healthy: r.degrees_healthy || '',
          pain: r.pain || '',
          notes: r.notes || ''
        }))
      : [{ ...emptyRomRow }],
    muscle_strength: zone.muscle_strength?.length
      ? zone.muscle_strength.map((r) => ({
          muscle: r.muscle || '',
          daniels: r.daniels || '',
          pain: r.pain || '',
          notes: r.notes || ''
        }))
      : [{ ...emptyStrengthRow }],
    special_results: Object.fromEntries(
      (zone.special_tests || []).map((t) => [
        t.name || '',
        { result: t.result || '', notes: t.notes || '' }
      ])
    ),
    palpation: zone.palpation || ''
  }));

  return {
    full_name: id.full_name || '',
    birth_date: id.birth_date || '',
    sex: id.sex || '',
    admission_date: id.admission_date || ev.evaluation_date || today(),
    occupation: id.occupation || '',
    phone: id.phone || '',
    emergency_contact: id.emergency_contact || '',
    referred_by: id.referred_by || '',
    therapist_name: id.therapist_name || '',
    family_history: hist.family_history || '',
    personal_history: hist.personal_history || '',
    surgical_history: hist.surgical_history || '',
    current_medications: hist.current_medications || '',
    known_allergies: hist.known_allergies || '',
    physical_activity: hist.physical_activity || '',
    previous_imaging: hist.previous_imaging || '',
    medical_diagnosis: c.medical_diagnosis || '',
    consultation_reason: c.reason || '',
    symptom_onset_date: c.symptom_onset_date || '',
    symptom_classification: c.symptom_classification || '',
    injury_mechanism: c.injury_mechanism || '',
    pain_mechanism: c.pain_mechanism || '',
    clinical_history: c.clinical_history || '',
    red_flags: rf.items || [],
    red_flags_other: rf.other || '',
    yellow_flags: yf.items || [],
    yellow_flags_other: yf.other || '',
    blood_pressure: g.blood_pressure || '',
    heart_rate: g.heart_rate || '',
    respiratory_rate: g.respiratory_rate || '',
    oxygen_saturation: g.oxygen_saturation || '',
    general_inspection: g.inspection || '',
    posture: g.posture || '',
    gait: g.gait || '',
    zones,
    pain_points: s.pain_map?.points || [],
    functional_scale_name: fs.name || '',
    functional_scale_score: fs.score || '',
    functional_scale_notes: fs.notes || '',
    prognosis: cl.diagnosis || ev.prognosis || '',
    recovery_prognosis: cl.prognosis || '',
    // Objetivos unificados: si la valoración trae el campo nuevo lo usamos; si
    // es antigua, fusionamos corto/mediano/largo en un solo texto etiquetado.
    objectives:
      cl.objectives ||
      [
        cl.objectives_short ? `Corto plazo: ${cl.objectives_short}` : '',
        cl.objectives_mid ? `Mediano plazo: ${cl.objectives_mid}` : '',
        cl.objectives_long ? `Largo plazo: ${cl.objectives_long}` : ''
      ]
        .filter(Boolean)
        .join('\n'),
    treatment_plan: cl.treatment_plan || ''
  };
}

export const today = (): string => getLocalISODate();

export const emptyRomRow: RomRow = {
  movement: '',
  type: '',
  range: '',
  degrees: '',
  degrees_healthy: '',
  pain: '',
  notes: ''
};
export const emptyStrengthRow: StrengthRow = { muscle: '', daniels: '', pain: '', notes: '' };

export const newZone = (): ZoneFormData => ({
  zone_id: '',
  zone_label: '',
  pain_location: '',
  pain_intensity: '',
  pain_type: '',
  aggravating_factors: '',
  easing_factors: '',
  movement_ranges: [{ ...emptyRomRow }],
  muscle_strength: [{ ...emptyStrengthRow }],
  special_results: {},
  palpation: ''
});

export const emptyEvaluation: EvaluationFormValues = {
  full_name: '',
  birth_date: '',
  sex: '',
  admission_date: today(),
  occupation: '',
  phone: '',
  emergency_contact: '',
  referred_by: '',
  therapist_name: '',
  family_history: '',
  personal_history: '',
  surgical_history: '',
  current_medications: '',
  known_allergies: '',
  physical_activity: '',
  previous_imaging: '',
  medical_diagnosis: '',
  consultation_reason: '',
  symptom_onset_date: '',
  symptom_classification: '',
  injury_mechanism: '',
  pain_mechanism: '',
  clinical_history: '',
  red_flags: [],
  red_flags_other: '',
  yellow_flags: [],
  yellow_flags_other: '',
  blood_pressure: '',
  heart_rate: '',
  respiratory_rate: '',
  oxygen_saturation: '',
  general_inspection: '',
  posture: '',
  gait: '',
  zones: [],
  pain_points: [],
  functional_scale_name: '',
  functional_scale_score: '',
  functional_scale_notes: '',
  prognosis: '',
  recovery_prognosis: '',
  objectives: '',
  treatment_plan: ''
};

export const sexOptions = ['', 'F', 'M', 'Otro'];

export const toNullable = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
};

export const cleanRows = <T extends object>(rows: ReadonlyArray<T>): Record<string, unknown>[] =>
  rows
    .map((row) =>
      Object.fromEntries(Object.entries(row).map(([key, value]) => [key, toNullable(value)]))
    )
    .filter((row) => Object.values(row).some(Boolean));
