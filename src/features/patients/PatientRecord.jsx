import { useMemo, useState, memo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { clinicalApi } from '../../services/clinicalApi.js';
import {
  buildClinicalRecordText,
  downloadTextFile,
  printClinicalRecord
} from '../../shared/exportClinicalRecord.js';
import { EvaluationForm } from '../evaluations/EvaluationForm.jsx';
import { SessionNoteEditor } from '../session-notes/SessionNoteEditor.jsx';
import { SessionNotesList } from '../session-notes/SessionNotesList.jsx';
import { AppointmentList } from '../appointments/AppointmentList.jsx';
import { ClinicalTimeline } from './ClinicalTimeline.jsx';
import { PatientEditForm } from './PatientEditForm.jsx';

export const getNextSessionNumber = (notes = []) => {
  const maxSession = notes.reduce((max, note) => {
    const value = Number(note.session_number);
    return Number.isFinite(value) && value > max ? value : max;
  }, 0);
  return maxSession + 1;
};

export const buildPatientSummary = ({ notes = [], evaluations = [] }) => {
  const sortedNotes = [...notes].sort(
    (a, b) => Number(a.session_number) - Number(b.session_number)
  );
  const evaValues = sortedNotes
    .map((note) => Number(note.eva))
    .filter((value) => Number.isFinite(value));
  const latestNote = sortedNotes.at(-1);
  const latestEvaluation = [...evaluations].sort(
    (a, b) => new Date(b.evaluation_date) - new Date(a.evaluation_date)
  )[0];
  const latestMedicalDiagnosis =
    latestEvaluation?.sections?.consultation?.medical_diagnosis ||
    latestEvaluation?.medical_diagnosis ||
    '';
  const initialEva =
    latestEvaluation?.eva_initial !== null && latestEvaluation?.eva_initial !== undefined
      ? Number(latestEvaluation.eva_initial)
      : evaValues[0];
  const latestEva = evaValues.at(-1);
  const evaChange =
    Number.isFinite(initialEva) && Number.isFinite(latestEva) ? latestEva - initialEva : null;

  return {
    sessionsCount: sortedNotes.length,
    latestSessionNumber: latestNote?.session_number || null,
    latestSessionDate: latestNote?.session_date || null,
    latestEva: Number.isFinite(latestEva) ? latestEva : null,
    initialEva: Number.isFinite(initialEva) ? initialEva : null,
    evaChange,
    diagnosis: latestEvaluation?.prognosis || '',
    medicalDiagnosis: latestMedicalDiagnosis,
    latestNotePreview: latestNote?.raw_text?.trim().slice(0, 180) || ''
  };
};

const renderValue = (value) => value || 'No registrado';

const ClinicalSummary = memo(function ClinicalSummary({ summary, nextSession }) {
  const evaTrend =
    summary.evaChange === null
      ? 'Sin tendencia'
      : summary.evaChange < 0
        ? `${Math.abs(summary.evaChange)} puntos menos`
        : summary.evaChange > 0
          ? `${summary.evaChange} puntos mas`
          : 'Sin cambio';

  return (
    <section className="card summary-card">
      <div className="form-header">
        <div>
          <p className="eyebrow">Resumen clinico</p>
          <h2>Estado del tratamiento</h2>
        </div>
        <span className="pill">Proxima #{nextSession}</span>
      </div>
      <div className="summary-grid">
        <div>
          <strong>{summary.sessionsCount}</strong>
          <span>sesiones</span>
        </div>
        <div>
          <strong>{summary.latestEva !== null ? `${summary.latestEva}/10` : 'S/EVA'}</strong>
          <span>EVA actual</span>
        </div>
        <div>
          <strong>{evaTrend}</strong>
          <span>cambio de dolor</span>
        </div>
      </div>
      <p>
        <strong>Diagnostico medico:</strong>{' '}
        {summary.medicalDiagnosis || 'Pendiente de registrar en valoracion.'}
      </p>
      <p>
        <strong>Diagnostico fisioterapeutico:</strong>{' '}
        {summary.diagnosis || 'Pendiente de registrar en valoracion.'}
      </p>
      <p className="muted">
        {summary.latestNotePreview
          ? `Ultima nota: ${summary.latestNotePreview}`
          : 'Aun no hay notas de sesion registradas.'}
      </p>
    </section>
  );
});

function EvaluationSummary({ evaluation }) {
  const sections = evaluation.sections || {};
  const identity = sections.patient_identity || {};
  const history = sections.history || {};
  const consultation = sections.consultation || {};
  const pain = sections.pain || {};
  const exam = sections.physical_exam || {};

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

export const PatientRecord = memo(function PatientRecord({ patient, onPatientUpdated, onPatientDeleted }) {
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [showEdit, setShowEdit] = useState(false);
  const [showEvaluation, setShowEvaluation] = useState(false);
  const [showSessionNote, setShowSessionNote] = useState(false);

  const { data: record, isLoading: loading, error } = useQuery({
    queryKey: ['patient', patient?.id],
    queryFn: () => clinicalApi.getPatient(patient.id),
    enabled: !!patient?.id,
  });

  const notes = useMemo(() => {
    const rows = record?.session_notes || [];
    return [...rows].sort((a, b) => Number(a.session_number) - Number(b.session_number));
  }, [record]);

  const aiConsults = useMemo(() => {
    const rows = record?.ai_consults || [];
    return [...rows].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [record]);

  const evaluations = useMemo(() => {
    const rows = record?.evaluations || [];
    return [...rows].sort((a, b) => new Date(b.evaluation_date) - new Date(a.evaluation_date));
  }, [record]);

  const timeline = useMemo(() => clinicalApi.buildTimeline(record), [record]);
  const summary = useMemo(() => buildPatientSummary({ notes, evaluations }), [notes, evaluations]);

  if (!patient) {
    return (
      <section className="card empty-record">
        <h2>Selecciona un paciente</h2>
        <p className="muted">El expediente, notas de sesion, IA y seguimiento apareceran aqui.</p>
      </section>
    );
  }

  const current = record || patient;
  const nextSession = getNextSessionNumber(notes);
  const refreshRecord = () => queryClient.invalidateQueries({ queryKey: ['patient', patient.id] });
  const exportRecord = () =>
    downloadTextFile({
      filename: `expediente-${current.full_name || current.id}.txt`,
      text: buildClinicalRecordText(current)
    });
  const deletePatient = async () => {
    const name = current.full_name || 'este paciente';
    const confirmed = window.confirm(
      `ELIMINACION DEFINITIVA: ¿Seguro que quieres borrar el expediente de ${name}? \n\nEsta accion es irreversible y eliminara todas sus notas, valoraciones e IA.`
    );
    if (!confirmed) return;

    const secondConfirm = window.confirm(
      `¿Confirmas que quieres borrar permanentemente todos los datos de ${name}?`
    );
    if (!secondConfirm) return;

    setDeleting(true);
    setDeleteError('');
    try {
      await clinicalApi.deletePatient(current.id);
      onPatientDeleted?.(current);
    } catch (err) {
      setDeleteError(err.message || 'No se pudo eliminar el paciente.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="record-stack">
      <article className="card record-header">
        <div>
          <p className="eyebrow">Expediente clinico</p>
          <h2>{current.full_name}</h2>
          <p className="muted">
            {summary.diagnosis || 'Sin diagnostico fisioterapeutico'}
          </p>
        </div>
        <div className="hero-actions">
          <span className="pill">{current.status || 'Sin estado'}</span>
          <button type="button" className="secondary" onClick={exportRecord}>
            Exportar TXT
          </button>
          <button type="button" className="secondary" onClick={() => printClinicalRecord(current)}>
            Exportar PDF
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => setShowEdit((value) => !value)}
          >
            {showEdit ? 'Cerrar edicion' : 'Editar'}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => setShowSessionNote((value) => !value)}
          >
            {showSessionNote ? 'Cerrar nota' : `Nota de sesion #${nextSession}`}
          </button>
          <button type="button" onClick={() => setShowEvaluation((value) => !value)}>
            {showEvaluation ? 'Cerrar valoracion' : 'Nueva valoracion'}
          </button>
          <button type="button" className="danger" disabled={deleting} onClick={deletePatient}>
            {deleting ? 'Eliminando...' : 'Eliminar paciente'}
          </button>
        </div>
      </article>

      {showEdit && (
        <PatientEditForm
          patient={current}
          onCancel={() => setShowEdit(false)}
          onUpdated={(updated) => {
            setShowEdit(false);
            onPatientUpdated?.(updated);
            refreshRecord();
          }}
        />
      )}

      {showEvaluation && (
        <EvaluationForm
          patient={current}
          onCancel={() => setShowEvaluation(false)}
          onCreated={() => {
            setShowEvaluation(false);
            refreshRecord();
          }}
        />
      )}

      <div className="record-grid">
        <section className="card compact-card">
          <p className="eyebrow">Contacto</p>
          <p>{current.phone || 'Sin telefono'}</p>
        </section>
        <section className="card compact-card">
          <p className="eyebrow">Diagnostico fisioterapeutico (desde valoracion)</p>
          <p>{summary.diagnosis || 'Sin diagnostico fisioterapeutico'}</p>
        </section>
      </div>

      {loading && <p className="muted">Cargando expediente...</p>}
      {error && (
        <p className="error" role="alert">
          {error.message || 'Error cargando expediente'}
        </p>
      )}
      {deleteError && (
        <p className="error" role="alert">
          {deleteError}
        </p>
      )}

      <ClinicalTimeline items={timeline} />
      <ClinicalSummary summary={summary} nextSession={nextSession} />

      {showSessionNote && (
        <SessionNoteEditor
          patientId={current.id}
          sessionNumber={nextSession}
          onCancel={() => setShowSessionNote(false)}
          onSaved={() => {
            setShowSessionNote(false);
            refreshRecord();
          }}
        />
      )}

      <section className="card">
        <div className="form-header">
          <div>
            <p className="eyebrow">Valoraciones</p>
            <h2>Historial de valoracion</h2>
          </div>
          <span className="pill">{evaluations.length}</span>
        </div>
        <div className="list-stack">
          {evaluations.map((evaluation) => (
            <article key={evaluation.id} className="note-row">
              <div className="form-header">
                <strong>{evaluation.evaluation_date}</strong>
                {evaluation.eva_initial !== null && evaluation.eva_initial !== undefined && (
                  <span>EVA inicial {evaluation.eva_initial}/10</span>
                )}
              </div>
              <p>{evaluation.prognosis || 'Sin diagnostico fisioterapeutico registrado'}</p>
              <EvaluationSummary evaluation={evaluation} />
              {evaluation.red_flags && (
                <p className="error">Banderas rojas: {evaluation.red_flags}</p>
              )}
            </article>
          ))}
          {!evaluations.length && <p className="muted">Aun no hay valoraciones registradas.</p>}
        </div>
      </section>

      <SessionNotesList notes={notes} onChanged={refreshRecord} />

      <AppointmentList patient={current} appointments={record?.appointments || []} onChanged={refreshRecord} />

      <section className="card">
        <div className="form-header">
          <div>
            <p className="eyebrow">IA trazable</p>
            <h2>Consultas IA</h2>
          </div>
          <span className="pill">{aiConsults.length}</span>
        </div>
        <div className="list-stack">
          {aiConsults.map((consult) => (
            <article key={consult.id} className="note-row">
              <div className="form-header">
                <strong>{consult.type}</strong>
                <span>{new Date(consult.created_at).toLocaleDateString()}</span>
              </div>
              <p className="muted">Validada: {consult.validated ? 'si' : 'pendiente'}</p>
              <pre>{consult.output_text}</pre>
            </article>
          ))}
          {!aiConsults.length && <p className="muted">Aun no hay consultas IA trazables.</p>}
        </div>
      </section>
    </section>
  );
});
