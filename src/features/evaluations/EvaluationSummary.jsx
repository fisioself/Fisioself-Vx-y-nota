export function EvaluationSummary({ evaluation }) {
  const sections = evaluation.sections || {};
  const identity = sections.patient_identity || {};
  const history = sections.history || {};
  const consultation = sections.consultation || {};
  const pain = sections.pain || {};
  const exam = sections.physical_exam || {};

  const renderValue = (value) => value || 'No registrado';

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
              <p key={`${row.joint}-${index}`}>
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
              <p key={`${row.joint}-${index}`}>
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
              <p key={`${row.name}-${index}`}>
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
