import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { clinicalApi } from '../../services/clinicalApi';
import { getLocalISODate, computeAge } from '../../shared/dateUtils';
import { draftStorage, getEvaluationDraftKey } from '../../shared/draftStorage';
import { useDraftAutosave } from '../../shared/useDraftAutosave';
import { getErrorMessage, isOfflineError, OFFLINE_MESSAGE } from '../../shared/errors';
import { useToast } from '../../app/ToastProvider';
import { PatientDocuments } from '../patients/PatientDocuments';
import { DateField } from '../../components/DateField';
import { BodyPainMap } from '../../components/BodyPainMap';
import { PromCalculator } from './PromCalculator';
import { PROM_SCALES, getPromScale } from './promsCatalog';
import { aiService, isAiConfigured } from '../../services/aiService';
import {
  ZONE_CATALOGS,
  getZoneCatalog,
  DEFAULT_TEST_OPTIONS,
  DANIELS_OPTIONS,
  ROM_RANGE_OPTIONS,
  getRomNorm,
  RED_FLAG_OPTIONS,
  YELLOW_FLAG_OPTIONS,
  FUNCTIONAL_SCALE_OPTIONS,
  SYMPTOM_CLASSIFICATION,
  INJURY_MECHANISM,
  PAIN_TYPE_OPTIONS,
  PAIN_MECHANISM_OPTIONS,
  PAIN_MECHANISM_DESCRIPTIONS
} from './evaluationCatalog';
import type {
  Patient,
  Evaluation,
  EvaluationSections,
  EvaluationZone,
  PainPoint
} from '../../types/clinical';
import './EvaluationForm.css';

interface RomRow {
  movement: string;
  type: string; // 'Activo' | 'Pasivo'
  range: string;
  degrees: string; // lado afectado
  degrees_healthy: string; // lado sano (comparativo bilateral)
  pain: string; // 'Sí' | 'No'
  notes: string;
}
interface StrengthRow {
  muscle: string;
  daniels: string;
  pain: string;
  notes: string;
}
// Resultado de una prueba especial, indexado por nombre de prueba del catálogo.
interface TestResult {
  result: string;
  notes: string;
}

interface ZoneFormData {
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

interface EvaluationFormValues {
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
}

interface EvaluationFormProps {
  patient?: Patient | null;
  patientId?: string;
  therapistId?: string | null;
  editingEvaluation?: Evaluation | null;
  onCreated?: (evaluation: Evaluation) => void;
  onUpdated?: (evaluation: Evaluation) => void;
  onCancel?: () => void;
}

function evaluationToFormValues(ev: Evaluation): EvaluationFormValues {
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

const today = (): string => getLocalISODate();

const emptyRomRow: RomRow = {
  movement: '',
  type: '',
  range: '',
  degrees: '',
  degrees_healthy: '',
  pain: '',
  notes: ''
};
const emptyStrengthRow: StrengthRow = { muscle: '', daniels: '', pain: '', notes: '' };

const newZone = (): ZoneFormData => ({
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

const emptyEvaluation: EvaluationFormValues = {
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

const sexOptions = ['', 'F', 'M', 'Otro'];

const toNullable = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
};

const cleanRows = <T extends object>(rows: ReadonlyArray<T>): Record<string, unknown>[] =>
  rows
    .map((row) =>
      Object.fromEntries(Object.entries(row).map(([key, value]) => [key, toNullable(value)]))
    )
    .filter((row) => Object.values(row).some(Boolean));

export function EvaluationForm({
  patient,
  patientId,
  therapistId,
  editingEvaluation,
  onCreated,
  onUpdated,
  onCancel
}: EvaluationFormProps) {
  const resolvedPatientId = patient?.id || patientId;
  // En modo edición no guardamos borrador (la valoración ya existe en la BD).
  const draftKey = editingEvaluation ? null : getEvaluationDraftKey(resolvedPatientId);

  const [values, setValues] = useState<EvaluationFormValues>(() => {
    if (editingEvaluation) {
      return evaluationToFormValues(editingEvaluation);
    }
    const draft = draftStorage.get(draftKey ?? '');
    if (draft) {
      try {
        return { ...emptyEvaluation, ...(JSON.parse(draft) as EvaluationFormValues) };
      } catch {
        // ignore
      }
    }
    return {
      ...emptyEvaluation,
      full_name: patient?.full_name || '',
      phone: patient?.phone || '',
      sex: patient?.sex || '',
      birth_date: patient?.birth_date || '',
      occupation: patient?.occupation || ''
    };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Id del campo al que debe desplazarse la vista cuando hay un error de validación.
  const [errorAnchorId, setErrorAnchorId] = useState<string | null>(null);
  // Calculadora PROM activa (vacío = captura manual). No se persiste: el puntaje
  // calculado sí queda en functional_scale_score/notes.
  const [calcScaleId, setCalcScaleId] = useState('');
  // Generación del diagnóstico con IA (Groq vía clinical-ai).
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState('');
  // Plan de intervención con evidencia científica.
  const [aiPlanGenerating, setAiPlanGenerating] = useState(false);
  const [aiPlanError, setAiPlanError] = useState('');
  // Objetivos del tratamiento generados con IA.
  const [aiObjGenerating, setAiObjGenerating] = useState(false);
  const [aiObjError, setAiObjError] = useState('');
  // Pronóstico fisioterapéutico generado con IA.
  const [aiPrognosisGenerating, setAiPrognosisGenerating] = useState(false);
  const [aiPrognosisError, setAiPrognosisError] = useState('');
  // Impresión diagnóstica médica sugerida con IA.
  const [aiMedDxGenerating, setAiMedDxGenerating] = useState(false);
  const [aiMedDxError, setAiMedDxError] = useState('');
  const { notify } = useToast();

  useDraftAutosave(draftKey, values);

  // Lleva la vista (y el foco) al campo que provocó el error de validación.
  useEffect(() => {
    if (!error || !errorAnchorId) return;
    const el = document.getElementById(errorAnchorId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      (el as HTMLElement).focus?.();
    }
  }, [error, errorAnchorId]);

  const age = useMemo(() => computeAge(values.birth_date), [values.birth_date]);

  const clearError = () => {
    setError('');
    setErrorAnchorId(null);
  };

  // Cierra el formulario, pero si hay datos capturados pide confirmar para no
  // perderlos por un toque accidental en "Cancelar". El borrador local
  // (useDraftAutosave) igual los conserva al reabrir, salvo en modo edición.
  const handleCancel = () => {
    const baseline = editingEvaluation
      ? evaluationToFormValues(editingEvaluation)
      : { ...emptyEvaluation, admission_date: values.admission_date };
    const dirty = JSON.stringify(values) !== JSON.stringify(baseline);
    if (
      dirty &&
      !window.confirm('Hay datos sin guardar en la valoración. ¿Salir de todos modos?')
    ) {
      return;
    }
    onCancel?.();
  };

  const setField = <K extends keyof EvaluationFormValues>(
    field: K,
    value: EvaluationFormValues[K]
  ) => {
    setValues((current) => ({ ...current, [field]: value }));
    clearError();
  };

  const toggleFlag = (field: 'red_flags' | 'yellow_flags', flag: string) => {
    setValues((current) => {
      const arr = current[field] as string[];
      const has = arr.includes(flag);
      return { ...current, [field]: has ? arr.filter((f) => f !== flag) : [...arr, flag] };
    });
    clearError();
  };

  const toggleRedFlag = (flag: string) => toggleFlag('red_flags', flag);
  const toggleYellowFlag = (flag: string) => toggleFlag('yellow_flags', flag);

  // --- Zonas ---
  const updateZone = (index: number, updater: (z: ZoneFormData) => ZoneFormData) => {
    setValues((current) => ({
      ...current,
      zones: current.zones.map((z, i) => (i === index ? updater(z) : z))
    }));
    setError('');
  };

  const addZone = () => setField('zones', [...values.zones, newZone()]);
  const removeZone = (index: number) =>
    setField(
      'zones',
      values.zones.filter((_, i) => i !== index)
    );

  // Arma un texto estructurado con los hallazgos marcados, para que la IA
  // redacte el diagnóstico solo a partir de datos reales de la valoración.
  const buildFindingsText = (): string => {
    const lines: string[] = [];
    if (values.consultation_reason) lines.push(`Motivo: ${values.consultation_reason}`);
    if (values.medical_diagnosis) lines.push(`Dx médico: ${values.medical_diagnosis}`);
    if (values.symptom_classification)
      lines.push(`Clasificación: ${values.symptom_classification}`);
    if (values.injury_mechanism) lines.push(`Mecanismo de lesión: ${values.injury_mechanism}`);
    if (values.pain_mechanism) lines.push(`Mecanismo del dolor: ${values.pain_mechanism}`);

    const reds = [...values.red_flags, values.red_flags_other.trim()].filter(Boolean);
    if (reds.length) lines.push(`Banderas rojas: ${reds.join('; ')}`);
    const yellows = [...values.yellow_flags, values.yellow_flags_other.trim()].filter(Boolean);
    if (yellows.length) lines.push(`Banderas amarillas: ${yellows.join('; ')}`);

    values.zones.forEach((z) => {
      const catalog = getZoneCatalog(z.zone_id);
      const label = catalog?.label || z.zone_label || 'Zona';
      const parts: string[] = [];
      if (z.pain_intensity !== '') parts.push(`EVA ${z.pain_intensity}/10`);
      if (z.pain_location) parts.push(`localización ${z.pain_location}`);
      if (z.pain_type) parts.push(`tipo ${z.pain_type}`);
      lines.push(`— Zona ${label}: ${parts.join(', ') || 'sin dolor registrado'}`);

      z.movement_ranges
        .filter((r) => r.movement && (r.degrees || r.range))
        .forEach((r) => {
          const norm = catalog ? getRomNorm(catalog.id, r.movement) : undefined;
          lines.push(
            `   ROM ${r.movement}${r.type ? ` (${r.type})` : ''}: ${r.degrees ? `${r.degrees}°` : r.range}` +
              `${r.degrees_healthy ? ` (sano ${r.degrees_healthy}°)` : ''}` +
              `${norm ? ` [normal ${norm}]` : ''}${r.pain ? ` · dolor: ${r.pain}` : ''}`
          );
        });

      z.muscle_strength
        .filter((r) => r.muscle && r.daniels)
        .forEach((r) => lines.push(`   Fuerza ${r.muscle}: Daniels ${r.daniels}`));

      Object.entries(z.special_results)
        .filter(([, r]) => r.result)
        .forEach(([name, r]) => lines.push(`   Prueba ${name}: ${r.result}`));

      if (z.palpation) lines.push(`   Palpación: ${z.palpation}`);
    });

    if (values.functional_scale_name || values.functional_scale_score) {
      lines.push(
        `Escala funcional: ${values.functional_scale_name} ${values.functional_scale_score}` +
          (values.functional_scale_notes ? ` (${values.functional_scale_notes})` : '')
      );
    }
    return lines.join('\n');
  };

  const generateDiagnosis = async () => {
    const findings = buildFindingsText();
    if (!findings.trim()) {
      setAiError('Marca algunos hallazgos (zona, pruebas, ROM…) antes de generar el diagnóstico.');
      return;
    }
    setAiGenerating(true);
    setAiError('');
    try {
      await aiService.transform({
        text: findings,
        type: 'evaluation_summary',
        onChunk: (acc) => setField('prognosis', acc)
      });
    } catch (err) {
      setAiError(getErrorMessage(err, 'No se pudo generar el diagnóstico con IA.'));
    } finally {
      setAiGenerating(false);
    }
  };

  const generateTreatmentPlan = async () => {
    const findings = buildFindingsText();
    const diagnosisCtx = values.prognosis.trim()
      ? `\nDx fisioterapéutico: ${values.prognosis}`
      : '';
    if (!findings.trim()) {
      setAiPlanError('Marca algunos hallazgos (zona, pruebas, ROM…) antes de generar el plan.');
      return;
    }
    setAiPlanGenerating(true);
    setAiPlanError('');
    try {
      await aiService.transform({
        text: findings + diagnosisCtx,
        type: 'treatment_plan_evidence',
        onChunk: (acc) => setField('treatment_plan', acc)
      });
    } catch (err) {
      setAiPlanError(getErrorMessage(err, 'No se pudo generar el plan con IA.'));
    } finally {
      setAiPlanGenerating(false);
    }
  };

  const generateObjectives = async () => {
    const findings = buildFindingsText();
    const diagnosisCtx = values.prognosis.trim()
      ? `\nDx fisioterapéutico: ${values.prognosis}`
      : '';
    if (!findings.trim()) {
      setAiObjError(
        'Marca algunos hallazgos (zona, pruebas, ROM…) antes de generar los objetivos.'
      );
      return;
    }
    setAiObjGenerating(true);
    setAiObjError('');
    try {
      await aiService.transform({
        text: findings + diagnosisCtx,
        type: 'treatment_objectives',
        onChunk: (acc) => setField('objectives', acc)
      });
    } catch (err) {
      setAiObjError(getErrorMessage(err, 'No se pudo generar los objetivos con IA.'));
    } finally {
      setAiObjGenerating(false);
    }
  };

  const generatePrognosis = async () => {
    const findings = buildFindingsText();
    const diagnosisCtx = values.prognosis.trim()
      ? `\nDx fisioterapéutico: ${values.prognosis}`
      : '';
    if (!findings.trim()) {
      setAiPrognosisError(
        'Marca algunos hallazgos (zona, pruebas, ROM…) antes de generar el pronóstico.'
      );
      return;
    }
    setAiPrognosisGenerating(true);
    setAiPrognosisError('');
    try {
      await aiService.transform({
        text: findings + diagnosisCtx,
        type: 'prognosis',
        onChunk: (acc) => setField('recovery_prognosis', acc)
      });
    } catch (err) {
      setAiPrognosisError(getErrorMessage(err, 'No se pudo generar el pronóstico con IA.'));
    } finally {
      setAiPrognosisGenerating(false);
    }
  };

  const generateMedicalDiagnosis = async () => {
    const findings = buildFindingsText();
    if (!findings.trim()) {
      setAiMedDxError(
        'Captura el motivo y algunos hallazgos antes de sugerir el diagnóstico médico.'
      );
      return;
    }
    setAiMedDxGenerating(true);
    setAiMedDxError('');
    try {
      await aiService.transform({
        text: findings,
        type: 'medical_diagnosis_suggestion',
        onChunk: (acc) => setField('medical_diagnosis', acc)
      });
    } catch (err) {
      setAiMedDxError(getErrorMessage(err, 'No se pudo sugerir el diagnóstico médico con IA.'));
    } finally {
      setAiMedDxGenerating(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resolvedPatientId) {
      setErrorAnchorId(null);
      setError('Selecciona un paciente antes de crear una valoracion.');
      return;
    }

    // Valida intensidades de dolor por zona (0-10).
    for (let i = 0; i < values.zones.length; i += 1) {
      const z = values.zones[i];
      if (z.pain_intensity !== '') {
        const n = Number(z.pain_intensity);
        if (!Number.isFinite(n) || n < 0 || n > 10) {
          setErrorAnchorId(`zone-${i}-pain-intensity`);
          setError('La intensidad del dolor de cada zona debe estar entre 0 y 10.');
          return;
        }
      }
    }

    setSaving(true);
    setError('');
    try {
      const zones: EvaluationZone[] = values.zones.map((z) => {
        const catalog = getZoneCatalog(z.zone_id);
        const label = catalog?.label || z.zone_label || z.zone_id || 'Zona';
        const special_tests = catalog
          ? catalog.specialTests
              .map((t) => {
                const r = z.special_results[t.name];
                if (!r || (!r.result && !r.notes)) return null;
                return {
                  name: t.name,
                  group: t.group,
                  result: toNullable(r.result),
                  notes: toNullable(r.notes)
                };
              })
              .filter((t): t is NonNullable<typeof t> => t !== null)
          : [];
        return {
          zone: label,
          zone_id: z.zone_id || null,
          pain: {
            location: toNullable(z.pain_location),
            intensity: z.pain_intensity === '' ? null : Number(z.pain_intensity),
            type: toNullable(z.pain_type),
            aggravating_factors: toNullable(z.aggravating_factors),
            easing_factors: toNullable(z.easing_factors)
          },
          movement_ranges: cleanRows(z.movement_ranges),
          muscle_strength: cleanRows(z.muscle_strength),
          special_tests,
          palpation: toNullable(z.palpation)
        };
      });

      const sections: EvaluationSections = {
        patient_identity: {
          full_name: toNullable(values.full_name),
          birth_date: toNullable(values.birth_date),
          age: toNullable(age),
          sex: toNullable(values.sex),
          admission_date: toNullable(values.admission_date),
          occupation: toNullable(values.occupation),
          phone: toNullable(values.phone),
          emergency_contact: toNullable(values.emergency_contact),
          referred_by: toNullable(values.referred_by),
          therapist_name: toNullable(values.therapist_name)
        },
        history: {
          family_history: toNullable(values.family_history),
          personal_history: toNullable(values.personal_history),
          surgical_history: toNullable(values.surgical_history),
          current_medications: toNullable(values.current_medications),
          known_allergies: toNullable(values.known_allergies),
          physical_activity: toNullable(values.physical_activity),
          previous_imaging: toNullable(values.previous_imaging)
        },
        consultation: {
          medical_diagnosis: toNullable(values.medical_diagnosis),
          reason: toNullable(values.consultation_reason),
          symptom_onset_date: toNullable(values.symptom_onset_date),
          symptom_classification: toNullable(values.symptom_classification),
          injury_mechanism: toNullable(values.injury_mechanism),
          pain_mechanism: toNullable(values.pain_mechanism),
          clinical_history: toNullable(values.clinical_history)
        },
        general_assessment: {
          blood_pressure: toNullable(values.blood_pressure),
          heart_rate: toNullable(values.heart_rate),
          respiratory_rate: toNullable(values.respiratory_rate),
          oxygen_saturation: toNullable(values.oxygen_saturation),
          inspection: toNullable(values.general_inspection),
          posture: toNullable(values.posture),
          gait: toNullable(values.gait)
        },
        red_flags: {
          items: values.red_flags,
          other: toNullable(values.red_flags_other)
        },
        yellow_flags: {
          items: values.yellow_flags,
          other: toNullable(values.yellow_flags_other)
        },
        zones,
        pain_map: { points: values.pain_points },
        functional_scales: {
          name: toNullable(values.functional_scale_name),
          score: toNullable(values.functional_scale_score),
          notes: toNullable(values.functional_scale_notes)
        },
        conclusion: {
          diagnosis: toNullable(values.prognosis),
          prognosis: toNullable(values.recovery_prognosis),
          // Objetivos unificados; los campos antiguos quedan en null al guardar.
          objectives: toNullable(values.objectives),
          objectives_short: null,
          objectives_mid: null,
          objectives_long: null,
          treatment_plan: toNullable(values.treatment_plan)
        }
      };

      // Resumen de banderas rojas para la columna `red_flags` (compat. timeline).
      const redFlagsSummary =
        [...values.red_flags, values.red_flags_other.trim()].filter(Boolean).join('; ') || null;
      // EVA inicial = la mayor intensidad reportada entre las zonas (para gráfica).
      const maxIntensity = values.zones.reduce<number | null>((max, z) => {
        if (z.pain_intensity === '') return max;
        const n = Number(z.pain_intensity);
        if (!Number.isFinite(n)) return max;
        return max === null ? n : Math.max(max, n);
      }, null);

      const payload = {
        patient_id: resolvedPatientId,
        therapist_id: therapistId || null,
        evaluation_date: values.admission_date || today(),
        eva_initial: maxIntensity,
        red_flags: redFlagsSummary,
        prognosis: values.prognosis.trim() || null,
        sections
      };

      if (editingEvaluation) {
        const evaluation = await clinicalApi.updateEvaluation(editingEvaluation.id, payload);
        onUpdated?.(evaluation);
      } else {
        const evaluation = await clinicalApi.addEvaluation(payload);
        draftStorage.remove(draftKey ?? '');
        setValues({ ...emptyEvaluation, admission_date: today() });
        onCreated?.(evaluation);
      }
    } catch (err) {
      if (isOfflineError(err)) {
        setError(OFFLINE_MESSAGE);
        notify({ tone: 'warning', message: 'Sin conexión. Los cambios se preservan localmente.' });
      } else {
        setError(getErrorMessage(err, 'No se pudo guardar la valoracion.'));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="card form-grid clinical-evaluation-form" onSubmit={submit}>
      <div className="form-header span-2">
        <div>
          <p className="eyebrow">
            {editingEvaluation ? 'Editar valoracion' : 'Valoracion inicial'}
          </p>
          <h2>{editingEvaluation ? 'Editar valoración clínica' : 'Nueva valoración clínica'}</h2>
        </div>
        {onCancel && (
          <button type="button" className="secondary" onClick={handleCancel}>
            Cancelar
          </button>
        )}
      </div>

      {/* 1. Datos generales */}
      <details className="form-section span-2" open>
        <summary>1. Datos generales</summary>
        <div className="form-grid">
          <label>
            Nombre completo
            <input
              value={values.full_name}
              onChange={(e) => setField('full_name', e.target.value)}
            />
          </label>
          <label>
            Fecha de nacimiento{age ? ` (${age} años)` : ''}
            <DateField value={values.birth_date} onChange={(iso) => setField('birth_date', iso)} />
          </label>
          <label>
            Sexo
            <select value={values.sex} onChange={(e) => setField('sex', e.target.value)}>
              {sexOptions.map((option) => (
                <option key={option} value={option}>
                  {option || 'Sin especificar'}
                </option>
              ))}
            </select>
          </label>
          <label>
            Fecha de ingreso
            <DateField
              value={values.admission_date}
              onChange={(iso) => setField('admission_date', iso)}
            />
          </label>
          <label>
            Ocupación
            <input
              value={values.occupation}
              onChange={(e) => setField('occupation', e.target.value)}
            />
          </label>
          <label>
            Número telefónico
            <input
              inputMode="tel"
              maxLength={25}
              value={values.phone}
              onChange={(e) => setField('phone', e.target.value)}
            />
          </label>
          <label>
            Contacto de emergencia
            <input
              placeholder="Nombre y teléfono"
              value={values.emergency_contact}
              onChange={(e) => setField('emergency_contact', e.target.value)}
            />
          </label>
          <label>
            Referido por
            <input
              value={values.referred_by}
              onChange={(e) => setField('referred_by', e.target.value)}
            />
          </label>
          <label className="span-2">
            Fisioterapeuta a cargo
            <select
              value={values.therapist_name}
              onChange={(e) => setField('therapist_name', e.target.value)}
            >
              <option value="">— Seleccionar —</option>
              <option value="Zyanya Camila Sandoval Meza">Zyanya Camila Sandoval Meza</option>
              <option value="Felipe de Jesús Pacheco Peñafiel">
                Felipe de Jesús Pacheco Peñafiel
              </option>
            </select>
          </label>
        </div>
      </details>

      {/* 2. Antecedentes */}
      <details className="form-section span-2">
        <summary>2. Antecedentes</summary>
        <div className="form-grid">
          <label className="span-2">
            Antecedentes heredofamiliares
            <textarea
              rows={2}
              placeholder="Ej. Artritis, diabetes, hipertensión."
              value={values.family_history}
              onChange={(e) => setField('family_history', e.target.value)}
            />
          </label>
          <label className="span-2">
            Antecedentes personales patológicos
            <textarea
              rows={3}
              placeholder="Enfermedades crónicas o sistémicas."
              value={values.personal_history}
              onChange={(e) => setField('personal_history', e.target.value)}
            />
          </label>
          <label className="span-2">
            Antecedentes quirúrgicos
            <textarea
              rows={2}
              value={values.surgical_history}
              onChange={(e) => setField('surgical_history', e.target.value)}
            />
          </label>
          <label>
            Medicamentos actuales
            <textarea
              rows={2}
              value={values.current_medications}
              onChange={(e) => setField('current_medications', e.target.value)}
            />
          </label>
          <label>
            Alergias conocidas
            <textarea
              rows={2}
              value={values.known_allergies}
              onChange={(e) => setField('known_allergies', e.target.value)}
            />
          </label>
          <label className="span-2">
            Actividad física y estilo de vida
            <textarea
              rows={2}
              placeholder="Nivel, tipo de actividad, frecuencia y limitaciones."
              value={values.physical_activity}
              onChange={(e) => setField('physical_activity', e.target.value)}
            />
          </label>
          <label className="span-2">
            Estudios de imagen o gabinete previos
            <textarea
              rows={2}
              placeholder="Sí/No y especificaciones."
              value={values.previous_imaging}
              onChange={(e) => setField('previous_imaging', e.target.value)}
            />
          </label>
        </div>
      </details>

      {/* 3. Motivo de consulta e historia */}
      <details className="form-section span-2">
        <summary>3. Motivo de consulta e historia del padecimiento</summary>
        <div className="form-grid">
          <label className="span-2">
            Motivo de consulta principal
            <textarea
              rows={2}
              value={values.consultation_reason}
              onChange={(e) => setField('consultation_reason', e.target.value)}
            />
          </label>
          <label>
            Diagnóstico médico
            <textarea
              rows={2}
              value={values.medical_diagnosis}
              onChange={(e) => setField('medical_diagnosis', e.target.value)}
            />
          </label>
          <label>
            Fecha de inicio de los síntomas
            <DateField
              value={values.symptom_onset_date}
              onChange={(iso) => setField('symptom_onset_date', iso)}
            />
          </label>
          <label>
            Clasificación
            <select
              value={values.symptom_classification}
              onChange={(e) => setField('symptom_classification', e.target.value)}
            >
              <option value="">—</option>
              {SYMPTOM_CLASSIFICATION.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
          <label>
            Mecanismo de lesión
            <select
              value={values.injury_mechanism}
              onChange={(e) => setField('injury_mechanism', e.target.value)}
            >
              <option value="">—</option>
              {INJURY_MECHANISM.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
          <label>
            Mecanismo del dolor
            <select
              value={values.pain_mechanism}
              onChange={(e) => setField('pain_mechanism', e.target.value)}
            >
              <option value="">—</option>
              {PAIN_MECHANISM_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            {values.pain_mechanism && PAIN_MECHANISM_DESCRIPTIONS[values.pain_mechanism] && (
              <small className="field-hint">
                {PAIN_MECHANISM_DESCRIPTIONS[values.pain_mechanism]}
              </small>
            )}
          </label>
          <label className="span-2">
            Historia clínica / Evolución del padecimiento
            <textarea
              rows={4}
              value={values.clinical_history}
              onChange={(e) => setField('clinical_history', e.target.value)}
            />
          </label>
        </div>
        <fieldset className="red-flags-box">
          <legend>Banderas rojas (Red Flags)</legend>
          <div className="red-flags-grid">
            {RED_FLAG_OPTIONS.map((flag) => (
              <label key={flag} className="checkbox-row">
                <input
                  type="checkbox"
                  checked={values.red_flags.includes(flag)}
                  onChange={() => toggleRedFlag(flag)}
                />
                <span>{flag}</span>
              </label>
            ))}
          </div>
          <label className="span-2">
            Otras banderas rojas
            <input
              value={values.red_flags_other}
              onChange={(e) => setField('red_flags_other', e.target.value)}
            />
          </label>
        </fieldset>
        <fieldset className="yellow-flags-box">
          <legend>Banderas amarillas (factores psicosociales)</legend>
          <div className="red-flags-grid">
            {YELLOW_FLAG_OPTIONS.map((flag) => (
              <label key={flag} className="checkbox-row">
                <input
                  type="checkbox"
                  checked={values.yellow_flags.includes(flag)}
                  onChange={() => toggleYellowFlag(flag)}
                />
                <span>{flag}</span>
              </label>
            ))}
          </div>
          <label className="span-2">
            Otras banderas amarillas
            <input
              value={values.yellow_flags_other}
              onChange={(e) => setField('yellow_flags_other', e.target.value)}
            />
          </label>
        </fieldset>
      </details>

      {/* 4. Valoración general */}
      <details className="form-section span-2">
        <summary>4. Valoración general (exploración física global)</summary>
        <div className="form-grid">
          <label>
            Presión arterial
            <input
              placeholder="120/80"
              value={values.blood_pressure}
              onChange={(e) => setField('blood_pressure', e.target.value)}
            />
            <small className="field-hint">Ref. ~120/80 mmHg</small>
          </label>
          <label>
            Frecuencia cardíaca
            <input
              inputMode="numeric"
              placeholder="lpm"
              value={values.heart_rate}
              onChange={(e) => setField('heart_rate', e.target.value)}
            />
            <small className="field-hint">Ref. 60–100 lpm</small>
          </label>
          <label>
            Frecuencia respiratoria
            <input
              inputMode="numeric"
              placeholder="rpm"
              value={values.respiratory_rate}
              onChange={(e) => setField('respiratory_rate', e.target.value)}
            />
            <small className="field-hint">Ref. 12–20 rpm</small>
          </label>
          <label>
            Saturación O₂
            <input
              inputMode="numeric"
              placeholder="%"
              value={values.oxygen_saturation}
              onChange={(e) => setField('oxygen_saturation', e.target.value)}
            />
            <small className="field-hint">Ref. 95–100 %</small>
          </label>
          <label className="span-2">
            Inspección general
            <textarea
              rows={2}
              placeholder="Estado de la piel, asimetrías evidentes, uso de aditamentos."
              value={values.general_inspection}
              onChange={(e) => setField('general_inspection', e.target.value)}
            />
          </label>
          <label className="span-2">
            Postura global
            <textarea
              rows={2}
              placeholder="Bipedestación: vista anterior, posterior y lateral."
              value={values.posture}
              onChange={(e) => setField('posture', e.target.value)}
            />
          </label>
          <label className="span-2">
            Patrón de marcha
            <textarea
              rows={2}
              placeholder="Fases de la marcha, claudicación, compensaciones."
              value={values.gait}
              onChange={(e) => setField('gait', e.target.value)}
            />
          </label>
        </div>
      </details>

      {/* 5. Valoración por zonas */}
      <details className="form-section span-2">
        <summary>5. Valoración por zonas específicas</summary>
        <p className="zone-subtitle">Mapa corporal de dolor</p>
        <BodyPainMap
          value={values.pain_points}
          onChange={(points) => setField('pain_points', points)}
        />
        <p className="zone-subtitle" style={{ marginTop: 18 }}>
          Zonas a evaluar
        </p>
        {values.zones.length === 0 && (
          <p className="muted" style={{ margin: '4px 0 12px' }}>
            Agrega una o más zonas a evaluar. Cada zona despliega su dolor, rangos, fuerza y batería
            de pruebas ortopédicas.
          </p>
        )}
        {values.zones.map((zone, index) => (
          <ZoneEditor
            key={index}
            zone={zone}
            index={index}
            onChange={(updater) => updateZone(index, updater)}
            onRemove={() => removeZone(index)}
          />
        ))}
        <button type="button" onClick={addZone} style={{ marginTop: 8 }}>
          + Agregar zona a evaluar
        </button>
      </details>

      {/* 6. Cuestionarios funcionales (PROMs) */}
      <details className="form-section span-2">
        <summary>6. Cuestionarios funcionales (PROMs)</summary>
        <p className="muted" style={{ margin: '4px 0 12px' }}>
          Escala estandarizada para medir la función de forma objetiva y dar seguimiento al progreso
          en sesiones posteriores.
        </p>
        <div className="form-grid">
          <label className="span-2">
            Calculadora integrada
            <select
              value={calcScaleId}
              onChange={(e) => {
                const id = e.target.value;
                setCalcScaleId(id);
                const scale = id ? getPromScale(id) : undefined;
                if (scale) {
                  // Al elegir una calculadora fijamos el nombre y limpiamos el
                  // puntaje previo: lo recalcula la propia calculadora.
                  setValues((c) => ({
                    ...c,
                    functional_scale_name: scale.name,
                    functional_scale_score: '',
                    functional_scale_notes: ''
                  }));
                }
              }}
            >
              <option value="">— Captura manual (sin calculadora) —</option>
              {PROM_SCALES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {calcScaleId ? (
          <PromCalculator
            scaleId={calcScaleId}
            onResult={(result) => {
              setValues((c) => ({
                ...c,
                functional_scale_score: result?.display ?? '',
                functional_scale_notes: result?.interpretation ?? ''
              }));
            }}
          />
        ) : (
          <div className="form-grid">
            <label>
              Escala aplicada
              <input
                list="functional-scale-list"
                placeholder="Ej. Oswestry, DASH, LEFS…"
                value={values.functional_scale_name}
                onChange={(e) => setField('functional_scale_name', e.target.value)}
              />
              <datalist id="functional-scale-list">
                {FUNCTIONAL_SCALE_OPTIONS.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </label>
            <label>
              Puntuación inicial
              <input
                placeholder="Ej. 42% · 28/80"
                value={values.functional_scale_score}
                onChange={(e) => setField('functional_scale_score', e.target.value)}
              />
            </label>
            <label className="span-2">
              Notas de la escala
              <input
                placeholder="Interpretación o detalles relevantes."
                value={values.functional_scale_notes}
                onChange={(e) => setField('functional_scale_notes', e.target.value)}
              />
            </label>
          </div>
        )}
      </details>

      {/* 7. Conclusión y diagnóstico */}
      <details className="form-section span-2">
        <summary>7. Conclusión y diagnóstico</summary>
        <div className="form-grid">
          <label className="span-2">
            <span className="dx-label-row">
              Diagnóstico médico
              {isAiConfigured && (
                <button
                  type="button"
                  className="secondary dx-ai-btn"
                  onClick={generateMedicalDiagnosis}
                  disabled={aiMedDxGenerating}
                >
                  {aiMedDxGenerating ? 'Generando…' : '✨ Sugerir con IA'}
                </button>
              )}
            </span>
            <textarea
              rows={2}
              value={values.medical_diagnosis}
              onChange={(e) => setField('medical_diagnosis', e.target.value)}
            />
            {aiMedDxError && (
              <small className="field-error" role="alert">
                {aiMedDxError}
              </small>
            )}
          </label>
          <label className="span-2">
            <span className="dx-label-row">
              Diagnóstico fisioterapéutico
              {isAiConfigured && (
                <button
                  type="button"
                  className="secondary dx-ai-btn"
                  onClick={generateDiagnosis}
                  disabled={aiGenerating}
                >
                  {aiGenerating ? 'Generando…' : '✨ Generar con IA'}
                </button>
              )}
            </span>
            <textarea
              rows={3}
              value={values.prognosis}
              onChange={(e) => setField('prognosis', e.target.value)}
            />
            {aiError && (
              <small className="field-error" role="alert">
                {aiError}
              </small>
            )}
          </label>
          <label className="span-2">
            <span className="dx-label-row">
              Objetivos del tratamiento
              {isAiConfigured && (
                <button
                  type="button"
                  className="secondary dx-ai-btn"
                  onClick={generateObjectives}
                  disabled={aiObjGenerating}
                >
                  {aiObjGenerating ? 'Generando…' : '✨ Generar con IA'}
                </button>
              )}
            </span>
            <textarea
              rows={4}
              placeholder="Objetivos a corto, mediano y largo plazo (función, dolor, ROM, fuerza, reintegro a actividades)."
              value={values.objectives}
              onChange={(e) => setField('objectives', e.target.value)}
            />
            {aiObjError && (
              <small className="field-error" role="alert">
                {aiObjError}
              </small>
            )}
          </label>
          <label className="span-2">
            <span className="dx-label-row">
              Pronóstico
              {isAiConfigured && (
                <button
                  type="button"
                  className="secondary dx-ai-btn"
                  onClick={generatePrognosis}
                  disabled={aiPrognosisGenerating}
                >
                  {aiPrognosisGenerating ? 'Generando…' : '✨ Generar con IA'}
                </button>
              )}
            </span>
            <textarea
              rows={3}
              placeholder="Expectativa y tiempo estimado de recuperación; factores favorables y desfavorables."
              value={values.recovery_prognosis}
              onChange={(e) => setField('recovery_prognosis', e.target.value)}
            />
            {aiPrognosisError && (
              <small className="field-error" role="alert">
                {aiPrognosisError}
              </small>
            )}
          </label>
          <label className="span-2">
            <span className="dx-label-row">
              Plan de intervención
              {isAiConfigured && (
                <button
                  type="button"
                  className="secondary dx-ai-btn"
                  onClick={generateTreatmentPlan}
                  disabled={aiPlanGenerating}
                >
                  {aiPlanGenerating ? 'Generando…' : '✨ Plan con evidencia'}
                </button>
              )}
            </span>
            <textarea
              rows={3}
              value={values.treatment_plan}
              onChange={(e) => setField('treatment_plan', e.target.value)}
            />
            {aiPlanError && (
              <small className="field-error" role="alert">
                {aiPlanError}
              </small>
            )}
          </label>
        </div>
      </details>

      {/* 8. Archivos clínicos */}
      {resolvedPatientId && (
        <details className="form-section span-2">
          <summary>8. Archivos clínicos y estudios</summary>
          <PatientDocuments patientId={resolvedPatientId} />
        </details>
      )}

      {error && (
        <p className="error span-2" role="alert">
          {error}
        </p>
      )}

      <div className="actions span-2">
        <button type="submit" disabled={saving}>
          {saving
            ? editingEvaluation
              ? 'Actualizando...'
              : 'Guardando...'
            : editingEvaluation
              ? 'Actualizar valoración'
              : 'Guardar valoración'}
        </button>
      </div>
    </form>
  );
}

// ---- Editor de una zona específica ----

interface ZoneEditorProps {
  zone: ZoneFormData;
  index: number;
  onChange: (updater: (z: ZoneFormData) => ZoneFormData) => void;
  onRemove: () => void;
}

function ZoneEditor({ zone, index, onChange, onRemove }: ZoneEditorProps) {
  const catalog = getZoneCatalog(zone.zone_id);

  const setZoneField = <K extends keyof ZoneFormData>(field: K, value: ZoneFormData[K]) =>
    onChange((z) => ({ ...z, [field]: value }));

  const setRom = (i: number, key: keyof RomRow, value: string) =>
    onChange((z) => ({
      ...z,
      movement_ranges: z.movement_ranges.map((r, ri) => (ri === i ? { ...r, [key]: value } : r))
    }));
  const addRom = () =>
    onChange((z) => ({ ...z, movement_ranges: [...z.movement_ranges, { ...emptyRomRow }] }));
  const removeRom = (i: number) =>
    onChange((z) => ({
      ...z,
      movement_ranges:
        z.movement_ranges.length === 1
          ? z.movement_ranges
          : z.movement_ranges.filter((_, ri) => ri !== i)
    }));

  const setStrength = (i: number, key: keyof StrengthRow, value: string) =>
    onChange((z) => ({
      ...z,
      muscle_strength: z.muscle_strength.map((r, ri) => (ri === i ? { ...r, [key]: value } : r))
    }));
  const addStrength = () =>
    onChange((z) => ({ ...z, muscle_strength: [...z.muscle_strength, { ...emptyStrengthRow }] }));
  const removeStrength = (i: number) =>
    onChange((z) => ({
      ...z,
      muscle_strength:
        z.muscle_strength.length === 1
          ? z.muscle_strength
          : z.muscle_strength.filter((_, ri) => ri !== i)
    }));

  const setTestResult = (name: string, key: keyof TestResult, value: string) =>
    onChange((z) => {
      const prev = z.special_results[name] ?? { result: '', notes: '' };
      return {
        ...z,
        special_results: {
          ...z.special_results,
          [name]: { ...prev, [key]: value }
        }
      };
    });

  // Agrupa las pruebas del catálogo por su subtítulo, preservando el orden.
  const groupedTests = useMemo(() => {
    if (!catalog) return [];
    const groups: { group: string; tests: typeof catalog.specialTests }[] = [];
    for (const t of catalog.specialTests) {
      let g = groups.find((x) => x.group === t.group);
      if (!g) {
        g = { group: t.group, tests: [] };
        groups.push(g);
      }
      g.tests.push(t);
    }
    return groups;
  }, [catalog]);

  return (
    <div className="zone-card">
      <div className="zone-card-head">
        <label style={{ flex: 1 }}>
          Zona a evaluar
          <select value={zone.zone_id} onChange={(e) => setZoneField('zone_id', e.target.value)}>
            <option value="">— Seleccionar zona —</option>
            {ZONE_CATALOGS.map((z) => (
              <option key={z.id} value={z.id}>
                {z.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="secondary"
          onClick={onRemove}
          aria-label={`Quitar zona ${index + 1}`}
        >
          Quitar zona
        </button>
      </div>

      {!zone.zone_id ? (
        <p className="muted" style={{ margin: '4px 2px 0' }}>
          Selecciona una zona para desplegar su batería de evaluación.
        </p>
      ) : (
        <>
          {/* A. Dolor */}
          <p className="zone-subtitle">A. Valoración del dolor</p>
          <div className="form-grid">
            <label>
              Localización exacta
              <input
                value={zone.pain_location}
                onChange={(e) => setZoneField('pain_location', e.target.value)}
              />
            </label>
            <div className="eva-field span-2">
              <div className="eva-head">
                <span>
                  Intensidad del dolor (EVA 0-10):{' '}
                  <strong>
                    {zone.pain_intensity === '' ? 'Sin registrar' : `${zone.pain_intensity}/10`}
                  </strong>
                </span>
                {zone.pain_intensity !== '' && (
                  <button
                    type="button"
                    className="eva-clear"
                    onClick={() => setZoneField('pain_intensity', '')}
                  >
                    Limpiar
                  </button>
                )}
              </div>
              <input
                id={`zone-${index}-pain-intensity`}
                className="eva-range"
                type="range"
                min={0}
                max={10}
                step={1}
                value={zone.pain_intensity === '' ? 0 : Number(zone.pain_intensity)}
                onChange={(e) => setZoneField('pain_intensity', e.target.value)}
                aria-label="Intensidad del dolor de 0 a 10"
              />
            </div>
            <label>
              Tipo de dolor
              <select
                value={zone.pain_type}
                onChange={(e) => setZoneField('pain_type', e.target.value)}
              >
                <option value="">—</option>
                {PAIN_TYPE_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Factores agravantes
              <input
                value={zone.aggravating_factors}
                onChange={(e) => setZoneField('aggravating_factors', e.target.value)}
              />
            </label>
            <label className="span-2">
              Factores que alivian
              <input
                value={zone.easing_factors}
                onChange={(e) => setZoneField('easing_factors', e.target.value)}
              />
            </label>
          </div>

          {/* B. ROM */}
          <p className="zone-subtitle">B. Rangos de movimiento (ROM)</p>
          <div className="clinical-table">
            {zone.movement_ranges.map((row, i) => (
              <div className="clinical-table-row rom-row" key={`rom-${i}`}>
                <select
                  aria-label="Movimiento"
                  value={row.movement}
                  onChange={(e) => setRom(i, 'movement', e.target.value)}
                >
                  <option value="">Movimiento…</option>
                  {catalog?.movements.map((mv) => (
                    <option key={mv} value={mv}>
                      {mv}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Tipo de movimiento"
                  value={row.type}
                  onChange={(e) => setRom(i, 'type', e.target.value)}
                >
                  <option value="">Tipo…</option>
                  <option value="Activo">Activo</option>
                  <option value="Pasivo">Pasivo</option>
                </select>
                <select
                  aria-label="Rango"
                  value={row.range}
                  onChange={(e) => setRom(i, 'range', e.target.value)}
                >
                  <option value="">Rango…</option>
                  {ROM_RANGE_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
                <input
                  aria-label="Grados lado afectado"
                  placeholder={
                    catalog && getRomNorm(catalog.id, row.movement)
                      ? `Afect. (nl ${getRomNorm(catalog.id, row.movement)})`
                      : 'Grados afectado °'
                  }
                  inputMode="numeric"
                  value={row.degrees}
                  onChange={(e) => setRom(i, 'degrees', e.target.value)}
                />
                <input
                  aria-label="Grados lado sano"
                  placeholder="Sano °"
                  inputMode="numeric"
                  value={row.degrees_healthy}
                  onChange={(e) => setRom(i, 'degrees_healthy', e.target.value)}
                />
                <select
                  aria-label="¿Genera dolor?"
                  value={row.pain}
                  onChange={(e) => setRom(i, 'pain', e.target.value)}
                >
                  <option value="">¿Dolor?</option>
                  <option value="Sí">Sí</option>
                  <option value="No">No</option>
                </select>
                <input
                  aria-label="Notas del movimiento"
                  placeholder="Notas"
                  value={row.notes}
                  onChange={(e) => setRom(i, 'notes', e.target.value)}
                />
                <button type="button" className="secondary" onClick={() => removeRom(i)}>
                  −
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="secondary" onClick={addRom}>
            + Agregar movimiento
          </button>

          {/* C. Fuerza */}
          <p className="zone-subtitle">C. Fuerza muscular (Daniels)</p>
          <div className="clinical-table">
            {zone.muscle_strength.map((row, i) => (
              <div className="clinical-table-row strength-row" key={`str-${i}`}>
                <select
                  aria-label="Músculo o grupo"
                  value={row.muscle}
                  onChange={(e) => setStrength(i, 'muscle', e.target.value)}
                >
                  <option value="">Músculo…</option>
                  {catalog?.muscles.map((mu) => (
                    <option key={mu} value={mu}>
                      {mu}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Escala de Daniels"
                  value={row.daniels}
                  onChange={(e) => setStrength(i, 'daniels', e.target.value)}
                >
                  <option value="">Daniels…</option>
                  {DANIELS_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="¿Genera dolor?"
                  value={row.pain}
                  onChange={(e) => setStrength(i, 'pain', e.target.value)}
                >
                  <option value="">¿Dolor?</option>
                  <option value="Sí">Sí</option>
                  <option value="No">No</option>
                </select>
                <input
                  aria-label="Notas de fuerza"
                  placeholder="Notas"
                  value={row.notes}
                  onChange={(e) => setStrength(i, 'notes', e.target.value)}
                />
                <button type="button" className="secondary" onClick={() => removeStrength(i)}>
                  −
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="secondary" onClick={addStrength}>
            + Agregar músculo
          </button>

          {/* D. Pruebas especiales (catálogo de la zona) */}
          <p className="zone-subtitle">D. Pruebas especiales / ortopédicas</p>
          {groupedTests.map((g) => (
            <div className="test-group" key={g.group}>
              <p className="test-group-title">{g.group}</p>
              {g.tests.map((t) => {
                const r = zone.special_results[t.name] ?? { result: '', notes: '' };
                const options = t.options ?? [...DEFAULT_TEST_OPTIONS];
                return (
                  <div className="test-row" key={t.name}>
                    <div className="test-info">
                      <span className="test-name">{t.name}</span>
                      {t.note && <span className="test-note">{t.note}</span>}
                    </div>
                    <div className="test-inputs">
                      {t.input === 'seconds' ? (
                        <input
                          aria-label={`Segundos ${t.name}`}
                          inputMode="numeric"
                          placeholder="seg"
                          value={r.result}
                          onChange={(e) => setTestResult(t.name, 'result', e.target.value)}
                        />
                      ) : t.input === 'text' ? (
                        <input
                          aria-label={`Resultado ${t.name}`}
                          placeholder="Resultado"
                          value={r.result}
                          onChange={(e) => setTestResult(t.name, 'result', e.target.value)}
                        />
                      ) : (
                        <select
                          aria-label={`Resultado ${t.name}`}
                          value={r.result}
                          onChange={(e) => setTestResult(t.name, 'result', e.target.value)}
                        >
                          <option value="">No valorado</option>
                          {options.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      )}
                      <input
                        aria-label={`Notas ${t.name}`}
                        placeholder="Notas"
                        value={r.notes}
                        onChange={(e) => setTestResult(t.name, 'notes', e.target.value)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {/* E. Palpación */}
          <p className="zone-subtitle">E. Palpación</p>
          <label className="span-2">
            Hallazgos
            <textarea
              rows={2}
              placeholder="Tono muscular, puntos gatillo, temperatura, edema articular."
              value={zone.palpation}
              onChange={(e) => setZoneField('palpation', e.target.value)}
            />
          </label>
        </>
      )}
    </div>
  );
}
