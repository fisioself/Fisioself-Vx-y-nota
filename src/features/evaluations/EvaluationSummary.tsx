import type { Evaluation, EvaluationZone } from '../../types/clinical';
import { BodyPainMap } from '../../components/BodyPainMap';
import { isRomRowAltered, isStrengthRowAltered } from '../../shared/clinicalFindings';

interface JointRow {
  joint?: string;
  range?: string;
  strength?: string;
  notes?: string;
  name?: string;
  result?: string;
}

type ExamSection = {
  examination?: string;
  general_inspection?: string;
  movement_ranges?: JointRow[];
  muscle_strength?: JointRow[];
  special_tests?: JointRow[];
};

interface EvaluationSummaryProps {
  evaluation: Evaluation;
}

const val = (value: unknown) => (value ? String(value) : 'No registrado');

export function EvaluationSummary({ evaluation }: EvaluationSummaryProps) {
  const sections = (evaluation.sections || {}) as Evaluation['sections'] & {
    physical_exam?: ExamSection;
  };
  const identity = (sections?.patient_identity || {}) as Record<string, string | undefined>;
  const history = (sections?.history || {}) as Record<string, string | undefined>;
  const consultation = sections?.consultation || {};
  const general = sections?.general_assessment || {};
  const pain = sections?.pain || {};
  const redFlags = sections?.red_flags || {};
  const yellowFlags = sections?.yellow_flags || {};
  const functional = sections?.functional_scales || {};
  const conclusion = sections?.conclusion || {};
  const zones = sections?.zones || [];
  const painPoints = sections?.pain_map?.points || [];
  const exam = sections?.physical_exam || {};

  // ¿Tiene la estructura nueva (zonas/conclusión) o es una valoración antigua?
  const hasLegacyExam =
    !!exam.examination ||
    !!exam.general_inspection ||
    !!exam.movement_ranges?.length ||
    !!exam.muscle_strength?.length ||
    !!exam.special_tests?.length;

  const redFlagList = [...(redFlags.items ?? []), redFlags.other].filter(Boolean) as string[];
  const yellowFlagList = [...(yellowFlags.items ?? []), yellowFlags.other].filter(
    Boolean
  ) as string[];

  return (
    <div className="evaluation-summary">
      <div className="record-grid">
        <div>
          <p className="eyebrow">Datos</p>
          <p>Edad: {val(identity.age)}</p>
          <p>Sexo: {val(identity.sex)}</p>
          <p>Ocupacion: {val(identity.occupation)}</p>
          <p>Fisioterapeuta: {val(identity.therapist_name)}</p>
          {identity.referred_by && <p>Referido por: {identity.referred_by}</p>}
        </div>
        <div>
          <p className="eyebrow">Consulta</p>
          <p>Motivo: {val(consultation.reason)}</p>
          {consultation.symptom_classification && (
            <p>Clasificación: {consultation.symptom_classification}</p>
          )}
          {consultation.injury_mechanism && <p>Mecanismo: {consultation.injury_mechanism}</p>}
          {consultation.pain_mechanism && <p>Mec. dolor: {consultation.pain_mechanism}</p>}
          {consultation.medical_diagnosis && <p>Dx médico: {consultation.medical_diagnosis}</p>}
        </div>
      </div>

      <p>
        <strong>Historia clinica:</strong> {val(consultation.clinical_history)}
      </p>
      <p>
        <strong>Antecedentes:</strong> {val(history.personal_history)}
      </p>

      {redFlagList.length > 0 && (
        <p className="error" style={{ margin: '4px 0' }}>
          <strong>Banderas rojas:</strong> {redFlagList.join('; ')}
        </p>
      )}

      {yellowFlagList.length > 0 && (
        <p style={{ margin: '4px 0', color: 'var(--warning-text)' }}>
          <strong>Banderas amarillas:</strong> {yellowFlagList.join('; ')}
        </p>
      )}

      {/* Dolor global LEGADO (valoraciones antiguas: el dolor era único, no por zona) */}
      {(pain.location || pain.intensity != null || pain.type || pain.aggravating_factors) && (
        <div>
          <p className="eyebrow">Dolor</p>
          <p>Localizacion: {val(pain.location)}</p>
          <p>Tipo: {val(pain.type)}</p>
          <p>Intensidad: {pain.intensity ?? 'No registrada'}/10</p>
          <p>Agravantes: {val(pain.aggravating_factors)}</p>
        </div>
      )}

      {/* Valoración general (estructura nueva) */}
      {(general.blood_pressure ||
        general.heart_rate ||
        general.inspection ||
        general.posture ||
        general.gait) && (
        <div>
          <p className="eyebrow">Valoración general</p>
          {(general.blood_pressure ||
            general.heart_rate ||
            general.respiratory_rate ||
            general.oxygen_saturation) && (
            <p>
              Signos vitales: TA {val(general.blood_pressure)} · FC {val(general.heart_rate)} · FR{' '}
              {val(general.respiratory_rate)} · SatO₂ {val(general.oxygen_saturation)}
            </p>
          )}
          {general.inspection && <p>Inspección: {general.inspection}</p>}
          {general.posture && <p>Postura: {general.posture}</p>}
          {general.gait && <p>Marcha: {general.gait}</p>}
        </div>
      )}

      {painPoints.length > 0 && (
        <div>
          <p className="eyebrow">Mapa corporal de dolor</p>
          <BodyPainMap value={painPoints} readOnly />
        </div>
      )}

      {/* Zonas evaluadas (estructura nueva) */}
      {zones.map((zone: EvaluationZone, zi: number) => (
        <div className="summary-zone" key={`zone-${zi}`}>
          <p className="eyebrow">Zona: {val(zone.zone)}</p>
          {zone.pain && (zone.pain.location || zone.pain.intensity != null || zone.pain.type) && (
            <p>
              Dolor: {val(zone.pain.location)}
              {zone.pain.intensity != null ? ` · ${zone.pain.intensity}/10` : ''}
              {zone.pain.type ? ` · ${zone.pain.type}` : ''}
            </p>
          )}
          {!!zone.movement_ranges?.length && (
            <div className="mini-table">
              {zone.movement_ranges.map((r, i) => (
                <p
                  key={`zr-${i}`}
                  className={isRomRowAltered(r.range, r.pain) ? 'finding-altered' : undefined}
                >
                  {val(r.movement)}
                  {r.type ? ` (${r.type})` : ''}: {val(r.range)}
                  {r.degrees ? ` · afectado ${r.degrees}°` : ''}
                  {r.degrees_healthy ? ` / sano ${r.degrees_healthy}°` : ''}
                  {r.pain === 'Sí' ? ' · con dolor' : ''}
                  {r.notes ? ` - ${r.notes}` : ''}
                </p>
              ))}
            </div>
          )}
          {!!zone.muscle_strength?.length && (
            <div className="mini-table">
              {zone.muscle_strength.map((r, i) => (
                <p
                  key={`zs-${i}`}
                  className={isStrengthRowAltered(r.daniels, r.pain) ? 'finding-altered' : undefined}
                >
                  {val(r.muscle)}: {val(r.daniels)}
                  {r.pain === 'Sí' ? ' · con dolor' : ''}
                  {r.notes ? ` - ${r.notes}` : ''}
                </p>
              ))}
            </div>
          )}
          {!!zone.special_tests?.length && (
            <div className="mini-table">
              {zone.special_tests.map((r, i) => (
                <p key={`zt-${i}`}>
                  {val(r.name)}: {val(r.result)}
                  {r.notes ? ` - ${r.notes}` : ''}
                </p>
              ))}
            </div>
          )}
          {zone.palpation && <p>Palpación: {zone.palpation}</p>}
        </div>
      ))}

      {/* Cuestionario funcional (PROMs) */}
      {(functional.name || functional.score) && (
        <div>
          <p className="eyebrow">Cuestionario funcional</p>
          <p>
            {val(functional.name)}
            {functional.score ? ` · ${functional.score}` : ''}
            {functional.notes ? ` — ${functional.notes}` : ''}
          </p>
        </div>
      )}

      {/* Conclusión (estructura nueva) */}
      {(conclusion.diagnosis ||
        conclusion.prognosis ||
        conclusion.objectives ||
        conclusion.objectives_short ||
        conclusion.objectives_mid ||
        conclusion.objectives_long ||
        conclusion.treatment_plan) && (
        <div>
          <p className="eyebrow">Conclusión</p>
          {conclusion.diagnosis && <p>Dx fisioterapéutico: {conclusion.diagnosis}</p>}
          {conclusion.prognosis && (
            <p style={{ whiteSpace: 'pre-line' }}>Pronóstico: {conclusion.prognosis}</p>
          )}
          {conclusion.objectives ? (
            <p style={{ whiteSpace: 'pre-line' }}>Objetivos: {conclusion.objectives}</p>
          ) : (
            <>
              {conclusion.objectives_short && (
                <p>Objetivos corto plazo: {conclusion.objectives_short}</p>
              )}
              {conclusion.objectives_mid && (
                <p>Objetivos mediano plazo: {conclusion.objectives_mid}</p>
              )}
              {conclusion.objectives_long && (
                <p>Objetivos largo plazo: {conclusion.objectives_long}</p>
              )}
            </>
          )}
          {conclusion.treatment_plan && <p>Plan de intervención: {conclusion.treatment_plan}</p>}
        </div>
      )}

      {/* Exploración física LEGADA (valoraciones antiguas, tablas planas globales) */}
      {hasLegacyExam && (
        <>
          <p>
            <strong>Exploracion:</strong> {val(exam.examination)}
          </p>
          <p>
            <strong>Inspeccion general:</strong> {val(exam.general_inspection)}
          </p>
          {!!exam.movement_ranges?.length && (
            <div>
              <p className="eyebrow">Rangos de movimiento</p>
              <div className="mini-table">
                {exam.movement_ranges.map((row, index) => (
                  <p key={`${row.joint || ''}-${index}`}>
                    {val(row.joint)}: {val(row.range)}
                    {row.notes ? ` - ${row.notes}` : ''}
                  </p>
                ))}
              </div>
            </div>
          )}
          {!!exam.muscle_strength?.length && (
            <div>
              <p className="eyebrow">Fuerza muscular</p>
              <div className="mini-table">
                {exam.muscle_strength.map((row, index) => (
                  <p key={`${row.joint || ''}-${index}`}>
                    {val(row.joint)}: {val(row.strength)}
                    {row.notes ? ` - ${row.notes}` : ''}
                  </p>
                ))}
              </div>
            </div>
          )}
          {!!exam.special_tests?.length && (
            <div>
              <p className="eyebrow">Pruebas especiales</p>
              <div className="mini-table">
                {exam.special_tests.map((row, index) => (
                  <p key={`${row.name || ''}-${index}`}>
                    {val(row.name)}: {val(row.result)}
                    {row.notes ? ` - ${row.notes}` : ''}
                  </p>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
