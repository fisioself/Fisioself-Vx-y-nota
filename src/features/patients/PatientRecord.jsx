import { useEffect, useMemo, useState } from 'react';
import { clinicalApi } from '../../services/clinicalApi.js';
import { EvaluationForm } from '../evaluations/EvaluationForm.jsx';
import { SessionNoteEditor } from '../session-notes/SessionNoteEditor.jsx';
import { ClinicalTimeline } from './ClinicalTimeline.jsx';
import { PatientEditForm } from './PatientEditForm.jsx';

export function PatientRecord({ patient, onPatientUpdated }) {
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [showEdit, setShowEdit] = useState(false);
  const [showEvaluation, setShowEvaluation] = useState(false);

  useEffect(() => {
    if (!patient?.id) {
      setRecord(null);
      setShowEdit(false);
      setShowEvaluation(false);
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
        <p className="muted">El expediente, notas, IA y seguimiento apareceran aqui.</p>
      </section>
    );
  }

  const current = record || patient;
  const nextSession = notes.length + 1;
  const refreshRecord = () => setRefreshKey((value) => value + 1);

  return (
    <section className="record-stack">
      <article className="card record-header">
        <div>
          <p className="eyebrow">Expediente clinico</p>
          <h2>{current.full_name}</h2>
          <p className="muted">
            {current.functional_diagnosis || current.medical_diagnosis || 'Sin diagnostico registrado'}
          </p>
        </div>
        <div className="hero-actions">
          <span className="pill">{current.status || 'Sin estado'}</span>
          <button type="button" className="secondary" onClick={() => setShowEdit((value) => !value)}>
            {showEdit ? 'Cerrar edicion' : 'Editar'}
          </button>
          <button type="button" onClick={() => setShowEvaluation((value) => !value)}>
            {showEvaluation ? 'Cerrar valoracion' : 'Nueva valoracion'}
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
          patientId={current.id}
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
      {error && <p className="error" role="alert">{error}</p>}

      <ClinicalTimeline items={timeline} />

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
              <p>{evaluation.prognosis || 'Sin pronostico registrado'}</p>
              {evaluation.red_flags && <p className="error">Banderas rojas: {evaluation.red_flags}</p>}
            </article>
          ))}
          {!evaluations.length && <p className="muted">Aun no hay valoraciones registradas.</p>}
        </div>
      </section>

      <SessionNoteEditor
        patientId={current.id}
        sessionNumber={nextSession}
        onSaved={refreshRecord}
      />

      <section className="card">
        <div className="form-header">
          <div>
            <p className="eyebrow">Historial</p>
            <h2>Notas de sesion</h2>
          </div>
          <span className="pill">{notes.length}</span>
        </div>
        <div className="list-stack">
          {notes.map((note) => (
            <article key={note.id} className="note-row">
              <div className="form-header">
                <strong>Sesion #{note.session_number}</strong>
                <span>{note.session_date}</span>
              </div>
              {note.eva !== null && note.eva !== undefined && <p className="muted">EVA: {note.eva}/10</p>}
              <pre>{note.raw_text}</pre>
            </article>
          ))}
          {!notes.length && <p className="muted">Aun no hay notas para este paciente.</p>}
        </div>
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
