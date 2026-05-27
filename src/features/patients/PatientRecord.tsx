import React, { useMemo, useState, memo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { clinicalApi, Patient } from '../../services/clinicalApi';
import { exportToPdf } from '../../shared/exportClinicalRecord.js';
import { EvaluationForm } from '../evaluations/EvaluationForm.jsx';
import { SessionNoteEditor } from '../session-notes/SessionNoteEditor.jsx';
import { SessionNotesList } from '../session-notes/SessionNotesList.jsx';
import { AppointmentList } from '../appointments/AppointmentList.jsx';
import { ClinicalTimeline } from './ClinicalTimeline.jsx';
import { PatientEditForm } from './PatientEditForm.jsx';
import { ClinicalSummary } from './ClinicalSummary';
import { useRole } from '../../shared/useRole.js';
import { EvaluationSummary } from '../evaluations/EvaluationSummary.jsx';
import { ImageUploader } from '../../components/ImageUploader.jsx';
import { ClinicalFilesList } from '../../components/ClinicalFilesList.jsx';

export const getNextSessionNumber = (notes: any[] = []) => {
  const maxSession = notes.reduce((max, note) => {
    const value = Number(note.session_number);
    return Number.isFinite(value) && value > max ? value : max;
  }, 0);
  return maxSession + 1;
};

export const buildPatientSummary = ({ notes = [], evaluations = [] }: { notes?: any[]; evaluations?: any[] }) => {
  const sortedNotes = [...notes].sort(
    (a, b) => Number(a.session_number) - Number(b.session_number)
  );
  const evaValues = sortedNotes
    .map((note) => Number(note.eva))
    .filter((value) => Number.isFinite(value));
  const latestNote = sortedNotes.at(-1);
  const latestEvaluation = [...evaluations].sort(
    (a, b) => new Date(b.evaluation_date).getTime() - new Date(a.evaluation_date).getTime()
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

interface PatientRecordProps {
  patient: Partial<Patient> | null;
  onPatientUpdated?: (patient: Patient) => void;
  onPatientDeleted?: (patient: Partial<Patient>) => void;
}

export const PatientRecord = memo(function PatientRecord({ 
  patient, 
  onPatientUpdated, 
  onPatientDeleted 
}: PatientRecordProps) {
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [showEdit, setShowEdit] = useState(false);
  const [showEvaluation, setShowEvaluation] = useState(false);
  const [showSessionNote, setShowSessionNote] = useState(false);
  const [openEvaluationId, setOpenEvaluationId] = useState<string | null>(null);

  const { data: record, isLoading: loading, error } = useQuery({
    queryKey: ['patient', patient?.id],
    queryFn: () => clinicalApi.getPatient(patient!.id),
    enabled: !!patient?.id,
  });

  const notes = useMemo(() => {
    const rows = record?.session_notes || [];
    return [...rows].sort((a: any, b: any) => Number(a.session_number) - Number(b.session_number));
  }, [record]);

  const aiConsults = useMemo(() => {
    const rows = record?.ai_consults || [];
    return [...rows].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [record]);

  const evaluations = useMemo(() => {
    const rows = record?.evaluations || [];
    return [...rows].sort((a: any, b: any) => new Date(b.evaluation_date).getTime() - new Date(a.evaluation_date).getTime());
  }, [record]);

  const timeline = useMemo(() => clinicalApi.buildTimeline(record), [record]);
  const summary = useMemo(() => buildPatientSummary({ notes, evaluations }), [notes, evaluations]);

  const { data: role } = useRole();
  const isAdmin = role === 'admin';

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
    } catch (err: any) {
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
          <button type="button" onClick={() => setShowEvaluation((value) => !value)}>
            {showEvaluation ? 'Cerrar valoracion' : 'Nueva valoracion'}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => setShowSessionNote((value) => !value)}
          >
            {showSessionNote ? 'Cerrar nota' : `Nota de sesion #${nextSession}`}
          </button>
          <button type="button" className="secondary" onClick={() => exportToPdf(current, timeline)}>
            Exportar PDF
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => setShowEdit((value) => !value)}
          >
            {showEdit ? 'Cerrar edicion' : 'Editar'}
          </button>
          {isAdmin && (
            <button type="button" className="danger" disabled={deleting} onClick={deletePatient}>
              {deleting ? 'Eliminando...' : 'Eliminar paciente'}
            </button>
          )}
        </div>
      </article>

      {showEdit && (
        <PatientEditForm
          patient={current}
          onCancel={() => setShowEdit(false)}
          onUpdated={(updated: Patient) => {
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
          {(error as Error).message || 'Error cargando expediente'}
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
          {evaluations.map((evaluation: any) => {
            const isOpen = openEvaluationId === evaluation.id;
            return (
              <article key={evaluation.id} className="note-row">
                <button
                  type="button"
                  className="note-toggle"
                  onClick={() => setOpenEvaluationId(isOpen ? null : evaluation.id)}
                >
                  <span>
                    <strong>{evaluation.evaluation_date}</strong>
                  </span>
                  {evaluation.eva_initial !== null && evaluation.eva_initial !== undefined && (
                    <span>EVA inicial {evaluation.eva_initial}/10</span>
                  )}
                </button>
                <p style={{ marginTop: '0.5rem', marginBottom: '0.5rem' }}>
                  {evaluation.prognosis || 'Sin diagnostico fisioterapeutico registrado'}
                </p>
                {evaluation.red_flags && (
                  <p className="error" style={{ marginBottom: '0.5rem' }}>
                    Banderas rojas: {evaluation.red_flags}
                  </p>
                )}
                {isOpen && <EvaluationSummary evaluation={evaluation} />}
              </article>
            );
          })}
          {!evaluations.length && <p className="muted">Aun no hay valoraciones registradas.</p>}
        </div>
      </section>

      <SessionNotesList notes={notes} onChanged={refreshRecord} />

      <AppointmentList patient={current} appointments={record?.appointments || []} onChanged={refreshRecord} />

      <section className="card">
        <div className="form-header">
          <div>
            <p className="eyebrow">Documentos</p>
            <h2>Archivos clinicos</h2>
          </div>
          <ImageUploader patientId={current.id} onUploadComplete={refreshRecord} />
        </div>
        <ClinicalFilesList patientId={current.id} refreshTrigger={record?.id} />
      </section>

      <section className="card">
        <div className="form-header">
          <div>
            <p className="eyebrow">IA trazable</p>
            <h2>Consultas IA</h2>
          </div>
          <span className="pill">{aiConsults.length}</span>
        </div>
        <div className="list-stack">
          {aiConsults.map((consult: any) => (
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
