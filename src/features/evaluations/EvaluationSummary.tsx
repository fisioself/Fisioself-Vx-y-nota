import type { Evaluation } from '../../types/clinical';

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

export function EvaluationSummary({ evaluation }: EvaluationSummaryProps) {
  const sections = (evaluation.sections || {}) as Evaluation['sections'] & {
    physical_exam?: ExamSection;
  };
  const identity = (sections?.patient_identity || {}) as Record<string, string | undefined>;
  const history = (sections?.history || {}) as Record<string, string | undefined>;
  const consultation = sections?.consultation || {};
  const pain = sections?.pain || {};
  const exam = sections?.physical_exam || {};

  const renderValue = (value: unknown) => (value ? String(value) : 'No registrado');

  return (
    <div className="evaluation-summary">
      <div className="record-grid">
        <div>
          <p className="eyebrow">Datos</p>
          <p>Edad: {renderValue(identity.age)}</p>
          <p>Sexo: {renderValue(identity.sex)}</p>
          <p>Ocupacion: {renderValue(identity.occupation)}</p>
          <p>Fisioterapeuta: {renderValue(identity.therapist_name)}</p>
        </div>
        <div>
          <p className="eyebrow">Dolor</p>
          <p>Localizacion: {renderValue(pain.location)}</p>
          <p>Tipo: {renderValue(pain.type)}</p>
          <p>Intensidad: {pain.intensity ?? 'No registrada'}/10</p>
          <p>Agravantes: {renderValue(pain.aggravating_factors)}</p>
        </div>
      </div>

      <p>
        <strong>Motivo:</strong> {renderValue(consultation.reason)}
      </p>
      <p>
        <strong>Historia clinica:</strong> {renderValue(consultation.clinical_history)}
      </p>
      <p>
        <strong>Antecedentes:</strong> {renderValue(history.personal_history)}
      </p>
      <p>
        <strong>Exploracion:</strong> {renderValue(exam.examination)}
      </p>
      <p>
        <strong>Inspeccion general:</strong> {renderValue(exam.general_inspection)}
      </p>

      {!!exam.movement_ranges?.length && (
        <div>
          <p className="eyebrow">Rangos de movimiento</p>
          <div className="mini-table">
            {exam.movement_ranges.map((row, index) => (
              <p key={`${row.joint || ''}-${index}`}>
                {renderValue(row.joint)}: {renderValue(row.range)}
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
                {renderValue(row.joint)}: {renderValue(row.strength)}
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
                {renderValue(row.name)}: {renderValue(row.result)}
                {row.notes ? ` - ${row.notes}` : ''}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
