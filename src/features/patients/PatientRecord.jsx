import { useEffect, useMemo, useState } from 'react';
import { clinicalApi } from '../../services/clinicalApi.js';
import {
  buildClinicalRecordText,
  downloadTextFile,
  printClinicalRecord
} from '../../shared/exportClinicalRecord.js';
import { EvaluationForm } from '../evaluations/EvaluationForm.jsx';
import { SessionNoteEditor } from '../session-notes/SessionNoteEditor.jsx';
import { SessionNotesList } from '../session-notes/SessionNotesList.jsx';
import { ClinicalTimeline } from './ClinicalTimeline.jsx';
import { PatientEditForm } from './PatientEditForm.jsx';

export const getNextSessionNumber = (notes = []) => {
  const maxSession = notes.reduce((max, note) => {
    const value = Number(note.session_number);
    return Number.isFinite(value) && value > max ? value : max;
  }, 0);
  return maxSession + 1;
};

const renderValue = (value) => value || 'No registrado';

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

export function PatientRecord({ patient, onPatientUpdated, onPatientDeleted }) {
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showEdit, setShowEdit] = useState(false);
  const [showEvaluation, setShowEvaluation] = useState(false);
  const [showSessionNote, setShowSessionNote] = useState(false);

  useEffect(() => {
    if (!patient?.id) {
      setRecord(null);
      setShowEdit(false);
      setShowEvaluation(false);
      setShowSessionNote(false);
      return;
    }

    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const data = await clinicalApi.getPatient(patient.id);
        if (!cancelled) setRecord(data);
      } catch (err) {
        if (!cancelled) setError(err.message || 'No se pudo cargar el expediente.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [patient?.id, refreshKey]);

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
  const refreshRecord = () => setRefreshKey((value) => value + 1);
  const exportRecord = () =>
    downloadTextFile({
      filename: `expediente-${current.full_name || current.id}.txt`,
      text: buildClinicalRecordText(current)
    });
  const deletePatient = async () => {
    const confirmed = window.confirm(
      `Eliminar definitivamente el expediente de ${current.full_name}? Esta accion tambien elimina sus valoraciones, notas y citas.`
    );
    if (!confirmed) return;

    setDeleting(true);
    setError('');
    try {
      await clinicalApi.deletePatient(current.id);
      onPatientDeleted?.(current);
    } catch (err) {
      setError(err.message || 'No se pudo eliminar el paciente.');
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
            {current.functional_diagnosis ||
              current.medical_diagnosis ||
              'Sin diagnostico registrado'}
          </p>
        </div>
        <div className="hero-actions">
          <span className="pill">{current.status || 'Sin estado'}</span>
          <button type="button" className="secondary" onClick={exportRecord}>
            Exportar TXT
          </button>
          <button type="button" className="secondary" onClick={() => printClinicalRecord(current)}>
            Imprimir/PDF
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
            setRecord((existing) => ({ ...(existing || {}), ...updated }));
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
          <p>{current.email || 'Sin correo'}</p>
        </section>
        <section className="card compact-card">
          <p className="eyebrow">Datos clinicos</p>
          <p>{current.medical_diagnosis || 'Sin diagnostico medico'}</p>
          <p>{current.functional_diagnosis || 'Sin diagnostico funcional'}</p>
        </section>
      </div>

      {loading && <p className="muted">Cargando expediente...</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <ClinicalTimeline items={timeline} />

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

      <SessionNotesList notes={notes} />

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
                <span>{new Date(consult.created_at).toLocaleDateString('es-MX')}</span>
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
}
