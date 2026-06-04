import { useState, type FormEvent } from 'react';
import { clinicalApi } from '../../services/clinicalApi';
import { getLocalISODate } from '../../shared/dateUtils';
import { draftStorage, getEvaluationDraftKey } from '../../shared/draftStorage';
import { useDraftAutosave } from '../../shared/useDraftAutosave';
import { getErrorMessage } from '../../shared/errors';
import { PatientDocuments } from '../patients/PatientDocuments';
import type { Patient, Evaluation, EvaluationSections } from '../../types/clinical';

interface JointRow {
  joint: string;
  range: string;
  notes: string;
}

interface StrengthRow {
  joint: string;
  strength: string;
  notes: string;
}

interface SpecialTestRow {
  name: string;
  result: string;
  notes: string;
}

interface EvaluationFormValues {
  full_name: string;
  age: string;
  sex: string;
  admission_date: string;
  occupation: string;
  phone: string;
  therapist_name: string;
  personal_history: string;
  surgical_history: string;
  current_medications: string;
  known_allergies: string;
  physical_activity: string;
  medical_diagnosis: string;
  consultation_reason: string;
  clinical_history: string;
  pain_location: string;
  pain_intensity: string;
  aggravating_factors: string;
  easing_factors: string;
  physical_examination: string;
  general_inspection: string;
  prognosis: string;
  movement_ranges: JointRow[];
  muscle_strength: StrengthRow[];
  special_tests: SpecialTestRow[];
}

interface EvaluationFormProps {
  patient?: Patient | null;
  patientId?: string;
  therapistId?: string | null;
  onCreated?: (evaluation: Evaluation) => void;
  onCancel?: () => void;
}

const today = (): string => getLocalISODate();

const emptyJointRow: JointRow = { joint: '', range: '', notes: '' };
const emptyStrengthRow: StrengthRow = { joint: '', strength: '', notes: '' };
const emptySpecialTestRow: SpecialTestRow = { name: '', result: '', notes: '' };

const emptyEvaluation: EvaluationFormValues = {
  full_name: '',
  age: '',
  sex: '',
  admission_date: today(),
  occupation: '',
  phone: '',
  therapist_name: '',
  personal_history: '',
  surgical_history: '',
  current_medications: '',
  known_allergies: '',
  physical_activity: '',
  medical_diagnosis: '',
  consultation_reason: '',
  clinical_history: '',
  pain_location: '',
  pain_intensity: '',
  aggravating_factors: '',
  easing_factors: '',
  physical_examination: '',
  general_inspection: '',
  prognosis: '',
  movement_ranges: [{ ...emptyJointRow }],
  muscle_strength: [{ ...emptyStrengthRow }],
  special_tests: [{ ...emptySpecialTestRow }]
};

const sexOptions = ['', 'F', 'M', 'Otro'];
const movementRangeOptions = ['', 'Limitado', 'Funcional', 'Completo'];
const strengthOptions = ['', 'Debil', 'Funcional', 'Fuerte'];
const testResultOptions = ['', 'Positivo', 'Negativo', 'No valorado'];

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

type RowField = 'movement_ranges' | 'muscle_strength' | 'special_tests';

export function EvaluationForm({
  patient,
  patientId,
  therapistId,
  onCreated,
  onCancel
}: EvaluationFormProps) {
  const resolvedPatientId = patient?.id || patientId;
  const draftKey = getEvaluationDraftKey(resolvedPatientId);

  const [values, setValues] = useState<EvaluationFormValues>(() => {
    const draft = draftStorage.get(draftKey);
    if (draft) {
      try {
        return JSON.parse(draft) as EvaluationFormValues;
      } catch {
        // ignore
      }
    }
    return {
      ...emptyEvaluation,
      full_name: patient?.full_name || '',
      phone: patient?.phone || '',
      sex: patient?.sex || '',
      occupation: patient?.occupation || ''
    };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const setField = <K extends keyof EvaluationFormValues>(
    field: K,
    value: EvaluationFormValues[K]
  ) => {
    setValues((current) => ({ ...current, [field]: value }));
    setError('');
  };

  useDraftAutosave(draftKey, values);

  const updateRows = (field: RowField, updater: (rows: object[]) => object[]) => {
    setValues((current) => ({ ...current, [field]: updater(current[field] as object[]) }));
    setError('');
  };

  const setRow = (field: RowField, index: number, key: string, value: string) => {
    updateRows(field, (rows) =>
      rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row))
    );
  };

  const addRow = <R extends object>(field: RowField, emptyRow: R) => {
    updateRows(field, (rows) => [...rows, { ...emptyRow }]);
  };

  const removeRow = (field: RowField, index: number) => {
    updateRows(field, (rows) => (rows.length === 1 ? rows : rows.filter((_, i) => i !== index)));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resolvedPatientId) {
      setError('Selecciona un paciente antes de crear una valoracion.');
      return;
    }

    const painIntensity = values.pain_intensity === '' ? null : Number(values.pain_intensity);
    if (
      painIntensity !== null &&
      (!Number.isFinite(painIntensity) || painIntensity < 0 || painIntensity > 10)
    ) {
      setError('La intensidad del dolor debe estar entre 0 y 10.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const sections: EvaluationSections = {
        patient_identity: {
          full_name: toNullable(values.full_name),
          age: toNullable(values.age),
          sex: toNullable(values.sex),
          admission_date: toNullable(values.admission_date),
          occupation: toNullable(values.occupation),
          phone: toNullable(values.phone),
          therapist_name: toNullable(values.therapist_name)
        },
        history: {
          personal_history: toNullable(values.personal_history),
          surgical_history: toNullable(values.surgical_history),
          current_medications: toNullable(values.current_medications),
          known_allergies: toNullable(values.known_allergies),
          physical_activity: toNullable(values.physical_activity)
        },
        consultation: {
          medical_diagnosis: toNullable(values.medical_diagnosis),
          reason: toNullable(values.consultation_reason),
          clinical_history: toNullable(values.clinical_history)
        },
        pain: {
          location: toNullable(values.pain_location),
          intensity: painIntensity,
          aggravating_factors: toNullable(values.aggravating_factors),
          easing_factors: toNullable(values.easing_factors)
        },
        physical_exam: {
          examination: toNullable(values.physical_examination),
          general_inspection: toNullable(values.general_inspection),
          movement_ranges: cleanRows(values.movement_ranges),
          muscle_strength: cleanRows(values.muscle_strength),
          special_tests: cleanRows(values.special_tests)
        }
      };

      const evaluation = await clinicalApi.addEvaluation({
        patient_id: resolvedPatientId,
        therapist_id: therapistId || null,
        evaluation_date: values.admission_date || today(),
        eva_initial: painIntensity,
        red_flags: null,
        prognosis: values.prognosis.trim() || null,
        sections
      });
      draftStorage.remove(draftKey);
      setValues(emptyEvaluation);
      onCreated?.(evaluation);
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo guardar la valoracion.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="card form-grid clinical-evaluation-form" onSubmit={submit}>
      <div className="form-header span-2">
        <div>
          <p className="eyebrow">Valoracion inicial</p>
          <h2>Nueva valoracion clinica</h2>
        </div>
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>

      <fieldset className="form-section span-2">
        <legend>Datos generales</legend>
        <div className="form-grid">
          <label>
            Nombre completo
            <input
              value={values.full_name}
              onChange={(e) => setField('full_name', e.target.value)}
            />
          </label>
          <label>
            Edad
            <input
              inputMode="numeric"
              value={values.age}
              onChange={(e) => setField('age', e.target.value)}
            />
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
            <input
              type="date"
              value={values.admission_date}
              onChange={(e) => setField('admission_date', e.target.value)}
            />
          </label>
          <label>
            Ocupacion
            <input
              value={values.occupation}
              onChange={(e) => setField('occupation', e.target.value)}
            />
          </label>
          <label>
            Numero telefonico
            <input
              inputMode="tel"
              maxLength={25}
              value={values.phone}
              onChange={(e) => setField('phone', e.target.value)}
            />
          </label>
          <label className="span-2">
            Fisioterapeuta
            <input
              maxLength={180}
              value={values.therapist_name}
              onChange={(e) => setField('therapist_name', e.target.value)}
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="form-section span-2">
        <legend>Antecedentes</legend>
        <div className="form-grid">
          <label className="span-2">
            Antecedentes personales
            <textarea
              rows={3}
              value={values.personal_history}
              onChange={(e) => setField('personal_history', e.target.value)}
            />
          </label>
          <label className="span-2">
            Antecedentes quirurgicos
            <textarea
              rows={3}
              value={values.surgical_history}
              onChange={(e) => setField('surgical_history', e.target.value)}
            />
          </label>
          <label>
            Medicamentos actuales
            <textarea
              rows={3}
              value={values.current_medications}
              onChange={(e) => setField('current_medications', e.target.value)}
            />
          </label>
          <label>
            Alergias conocidas
            <textarea
              rows={3}
              value={values.known_allergies}
              onChange={(e) => setField('known_allergies', e.target.value)}
            />
          </label>
          <label className="span-2">
            Actividad fisica y estilo de vida
            <textarea
              rows={3}
              placeholder="Nivel, tipo de actividad, frecuencia y limitaciones."
              value={values.physical_activity}
              onChange={(e) => setField('physical_activity', e.target.value)}
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="form-section span-2">
        <legend>Motivo de consulta e historia</legend>
        <div className="form-grid">
          <label className="span-2">
            Motivo de consulta
            <textarea
              rows={3}
              value={values.consultation_reason}
              onChange={(e) => setField('consultation_reason', e.target.value)}
            />
          </label>
          <label className="span-2">
            Historia clinica
            <textarea
              rows={4}
              value={values.clinical_history}
              onChange={(e) => setField('clinical_history', e.target.value)}
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="form-section span-2">
        <legend>Valoracion del dolor</legend>
        <div className="form-grid">
          <label>
            Localizacion
            <input
              value={values.pain_location}
              onChange={(e) => setField('pain_location', e.target.value)}
            />
          </label>
          <label>
            Intensidad 0-10
            <input
              type="number"
              min={0}
              max={10}
              value={values.pain_intensity}
              onChange={(e) => setField('pain_intensity', e.target.value)}
            />
          </label>
          <label>
            Factores agravantes
            <input
              value={values.aggravating_factors}
              onChange={(e) => setField('aggravating_factors', e.target.value)}
            />
          </label>
          <label className="span-2">
            Factores que alivian
            <input
              value={values.easing_factors}
              onChange={(e) => setField('easing_factors', e.target.value)}
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="form-section span-2">
        <legend>Exploracion fisica</legend>
        <div className="form-grid">
          <label className="span-2">
            Exploracion fisica
            <textarea
              rows={4}
              value={values.physical_examination}
              onChange={(e) => setField('physical_examination', e.target.value)}
            />
          </label>
          <label className="span-2">
            Inspeccion general
            <textarea
              rows={3}
              placeholder="Estado general, nivel de cooperacion, uso de aditamentos."
              value={values.general_inspection}
              onChange={(e) => setField('general_inspection', e.target.value)}
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="form-section span-2">
        <legend>Rangos de movimiento</legend>
        <div className="clinical-table">
          {values.movement_ranges.map((row, index) => (
            <div className="clinical-table-row" key={`movement-${index}`}>
              <input
                aria-label="Articulación"
                placeholder="Articulacion"
                value={row.joint}
                onChange={(e) => setRow('movement_ranges', index, 'joint', e.target.value)}
              />
              <select
                aria-label="Rango de movimiento"
                value={row.range}
                onChange={(e) => setRow('movement_ranges', index, 'range', e.target.value)}
              >
                {movementRangeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option || 'Rango'}
                  </option>
                ))}
              </select>
              <input
                aria-label="Notas del rango"
                placeholder="Notas"
                value={row.notes}
                onChange={(e) => setRow('movement_ranges', index, 'notes', e.target.value)}
              />
              <button
                type="button"
                className="secondary"
                onClick={() => removeRow('movement_ranges', index)}
              >
                Quitar
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="secondary"
          onClick={() => addRow('movement_ranges', emptyJointRow)}
        >
          Agregar articulacion
        </button>
      </fieldset>

      <fieldset className="form-section span-2">
        <legend>Fuerza muscular</legend>
        <div className="clinical-table">
          {values.muscle_strength.map((row, index) => (
            <div className="clinical-table-row" key={`strength-${index}`}>
              <input
                aria-label="Articulación o grupo muscular"
                placeholder="Articulacion / grupo muscular"
                value={row.joint}
                onChange={(e) => setRow('muscle_strength', index, 'joint', e.target.value)}
              />
              <select
                aria-label="Fuerza muscular"
                value={row.strength}
                onChange={(e) => setRow('muscle_strength', index, 'strength', e.target.value)}
              >
                {strengthOptions.map((option) => (
                  <option key={option} value={option}>
                    {option || 'Fuerza'}
                  </option>
                ))}
              </select>
              <input
                aria-label="Notas de fuerza"
                placeholder="Notas"
                value={row.notes}
                onChange={(e) => setRow('muscle_strength', index, 'notes', e.target.value)}
              />
              <button
                type="button"
                className="secondary"
                onClick={() => removeRow('muscle_strength', index)}
              >
                Quitar
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="secondary"
          onClick={() => addRow('muscle_strength', emptyStrengthRow)}
        >
          Agregar fuerza
        </button>
      </fieldset>

      <fieldset className="form-section span-2">
        <legend>Pruebas especiales</legend>
        <div className="clinical-table">
          {values.special_tests.map((row, index) => (
            <div className="clinical-table-row" key={`test-${index}`}>
              <input
                aria-label="Nombre de la prueba especial"
                placeholder="Prueba"
                value={row.name}
                onChange={(e) => setRow('special_tests', index, 'name', e.target.value)}
              />
              <select
                aria-label="Resultado de la prueba"
                value={row.result}
                onChange={(e) => setRow('special_tests', index, 'result', e.target.value)}
              >
                {testResultOptions.map((option) => (
                  <option key={option} value={option}>
                    {option || 'Resultado'}
                  </option>
                ))}
              </select>
              <input
                aria-label="Notas de la prueba"
                placeholder="Notas"
                value={row.notes}
                onChange={(e) => setRow('special_tests', index, 'notes', e.target.value)}
              />
              <button
                type="button"
                className="secondary"
                onClick={() => removeRow('special_tests', index)}
              >
                Quitar
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="secondary"
          onClick={() => addRow('special_tests', emptySpecialTestRow)}
        >
          Agregar prueba
        </button>
      </fieldset>

      <label className="span-2">
        Diagnostico fisioterapeutico
        <textarea
          rows={3}
          value={values.prognosis}
          onChange={(e) => setField('prognosis', e.target.value)}
        />
      </label>

      {resolvedPatientId && (
        <fieldset className="form-section span-2">
          <legend>Archivos clínicos y estudios</legend>
          <PatientDocuments patientId={resolvedPatientId} />
        </fieldset>
      )}

      {error && (
        <p className="error span-2" role="alert">
          {error}
        </p>
      )}

      <div className="actions span-2">
        <button type="submit" disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar valoracion'}
        </button>
      </div>
    </form>
  );
}
