import { useMemo, useState, useEffect, memo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { clinicalApi } from '../../services/clinicalApi';
import type { Patient, SessionNote, Evaluation, ClinicalRecord } from '../../types/clinical';
import { exportToPdf, printEvaluation } from '../../shared/exportClinicalRecord';
import { EvaluationForm } from '../evaluations/EvaluationForm';
import { SessionNoteEditor } from '../session-notes/SessionNoteEditor';
import { SessionNotesList } from '../session-notes/SessionNotesList';
import { AppointmentList } from '../appointments/AppointmentList';
import { ClinicalTimeline } from './ClinicalTimeline';
import { PatientEditForm } from './PatientEditForm';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { ClinicalSummary } from './ClinicalSummary';
import { useRole } from '../../shared/useRole';
import { EvaluationSummary } from '../evaluations/EvaluationSummary';
import { EvaluationComparison } from '../evaluations/EvaluationComparison';
import { SkeletonList } from '../../components/Skeleton';

const buildPatientWhatsAppUrl = (patient: Patient | Partial<Patient>): string => {
  const phone = (patient.phone ?? '').replace(/\D/g, '');
  const number = phone.length === 10 ? `52${phone}` : phone;
  const name = patient.full_name?.split(' ')[0] ?? 'paciente';
  const msg = `Hola ${name} 😊 Te contactamos desde Fisioself. ¿Cómo te has sentido? Estamos disponibles para cualquier duda o para agendar tu próxima cita.`;
  return `https://wa.me/${number}?text=${encodeURIComponent(msg)}`;
};

export const getNextSessionNumber = (notes: Pick<SessionNote, 'session_number'>[] = []) => {
  const maxSession = notes.reduce((max, note) => {
    const value = Number(note.session_number);
    return Number.isFinite(value) && value > max ? value : max;
  }, 0);
  return maxSession + 1;
};

export const buildPatientSummary = ({
  notes = [],
  evaluations = []
}: {
  notes?: SessionNote[];
  evaluations?: Evaluation[];
}) => {
  const sortedNotes = [...notes].sort(
    (a, b) => Number(a.session_number) - Number(b.session_number)
  );
  const evaValues = sortedNotes
    .map((note) => Number(note.eva))
    .filter((value) => Number.isFinite(value));
  const latestNote = sortedNotes.at(-1);
  const latestEvaluation = [...evaluations].sort(
    (a, b) =>
      new Date(b.evaluation_date ?? '').getTime() - new Date(a.evaluation_date ?? '').getTime()
  )[0];
  const latestMedicalDiagnosis =
    latestEvaluation?.sections?.consultation?.medical_diagnosis ||
    latestEvaluation?.medical_diagnosis ||
    '';
  const initialEvaRaw = latestEvaluation?.eva_initial;
  const initialEva =
    initialEvaRaw !== null && initialEvaRaw !== undefined ? Number(initialEvaRaw) : evaValues[0];
  const latestEva = evaValues.at(-1);
  const evaChange =
    Number.isFinite(initialEva) && Number.isFinite(latestEva)
      ? (latestEva as number) - (initialEva as number)
      : null;

  const evaHistory: { date: string; value: number }[] = [];
  if (Number.isFinite(initialEva) && latestEvaluation?.evaluation_date) {
    evaHistory.push({ date: latestEvaluation.evaluation_date, value: initialEva as number });
  }
  sortedNotes.forEach((note) => {
    const nv = Number(note.eva);
    if (Number.isFinite(nv) && note.session_date) {
      evaHistory.push({ date: note.session_date, value: nv });
    }
  });

  return {
    sessionsCount: sortedNotes.length,
    latestSessionNumber: latestNote?.session_number ?? null,
    latestSessionDate: latestNote?.session_date ?? null,
    latestEva: Number.isFinite(latestEva) ? (latestEva as number) : null,
    initialEva: Number.isFinite(initialEva) ? (initialEva as number) : null,
    evaChange,
    evaHistory,
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showEvaluation, setShowEvaluation] = useState(() => {
    const pid = patient?.id;
    if (!pid) return false;
    return sessionStorage.getItem(`fisioself_eval_open_${pid}`) === '1';
  });
  const [showSessionNote, setShowSessionNote] = useState(false);
  const [openEvaluationId, setOpenEvaluationId] = useState<string | null>(null);
  const [editingEvaluation, setEditingEvaluation] = useState<Evaluation | null>(null);

  // Persiste si la valoración estaba abierta para que volver de otra pestaña
  // la restaure sin perder el borrador (que ya vive en localStorage).
  useEffect(() => {
    const pid = patient?.id;
    if (!pid) return;
    if (showEvaluation) {
      sessionStorage.setItem(`fisioself_eval_open_${pid}`, '1');
    } else {
      sessionStorage.removeItem(`fisioself_eval_open_${pid}`);
    }
  }, [showEvaluation, patient?.id]);

  const {
    data: record,
    isLoading: loading,
    error,
    refetch,
    isRefetching
  } = useQuery<ClinicalRecord, Error>({
    queryKey: ['patient', patient?.id],
    queryFn: () => clinicalApi.getPatient(patient?.id ?? ''),
    enabled: !!patient?.id,
    retry: (failureCount, err) => {
      const msg = err?.message ?? '';
      // No reintentar en errores permanentes (4xx, not found)
      if (/40[134]|PGRST116|not found/i.test(msg)) return false;
      return failureCount < 3;
    },
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000)
  });

  const notes = useMemo<SessionNote[]>(() => {
    const rows = record?.session_notes || [];
    return [...rows].sort((a, b) => Number(a.session_number) - Number(b.session_number));
  }, [record]);

  const aiConsults = useMemo(() => {
    const rows = record?.ai_consults || [];
    return [...rows].sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );
  }, [record]);

  const evaluations = useMemo<Evaluation[]>(() => {
    const rows = record?.evaluations || [];
    return [...rows].sort(
      (a, b) =>
        new Date(b.evaluation_date || 0).getTime() - new Date(a.evaluation_date || 0).getTime()
    );
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

  // `record` (when cargado) es un Patient completo; en su defecto usamos el
  // paciente seleccionado, que siempre incluye al menos el `id`.
  const current = (record || patient) as Patient;
  const nextSession = getNextSessionNumber(notes);
  const refreshRecord = () => queryClient.invalidateQueries({ queryKey: ['patient', patient.id] });

  const deletePatient = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      await clinicalApi.deletePatient(current.id);
      setShowDeleteConfirm(false);
      onPatientDeleted?.(current);
    } catch (err) {
      // Los errores de Supabase (PostgrestError) no son instancias de Error,
      // así que extraemos el mensaje del objeto para no ocultar la causa real.
      const msg =
        err instanceof Error ? err.message : (err as { message?: string } | null)?.message;
      setDeleteError(msg || 'No se pudo eliminar el paciente.');
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
          <p className="muted">{summary.diagnosis || 'Sin diagnostico fisioterapeutico'}</p>
        </div>
        <div className="hero-actions">
          <button
            type="button"
            // Esperamos a que cargue el expediente completo (record) antes de
            // permitir abrir la valoración: así el formulario se pre-rellena con
            // nombre, teléfono, sexo, fecha de nacimiento y ocupación del
            // paciente (vienen del registro completo, no del objeto mínimo que
            // llega al seleccionar desde la agenda).
            disabled={!showEvaluation && !record}
            onClick={() => setShowEvaluation((value) => !value)}
          >
            {showEvaluation ? 'Cerrar valoracion' : record ? 'Nueva valoracion' : 'Cargando datos…'}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => setShowSessionNote((value) => !value)}
          >
            {showSessionNote ? 'Cerrar nota' : `Nota de sesion #${nextSession}`}
          </button>
          <button type="button" className="secondary" onClick={() => exportToPdf(current)}>
            Exportar PDF
          </button>
          {current.phone && (
            <a
              href={buildPatientWhatsAppUrl(current)}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                textDecoration: 'none',
                minHeight: 44,
                padding: '0 16px',
                background: '#25d366',
                color: 'white',
                borderRadius: 14,
                fontWeight: 700,
                fontSize: '0.9rem',
                cursor: 'pointer'
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              WhatsApp
            </a>
          )}
          <button
            type="button"
            className="secondary"
            onClick={() => setShowEdit((value) => !value)}
          >
            {showEdit ? 'Cerrar edicion' : 'Editar'}
          </button>
          {isAdmin && (
            <button
              type="button"
              className="danger"
              disabled={deleting}
              onClick={() => {
                setDeleteError('');
                setShowDeleteConfirm(true);
              }}
            >
              {deleting ? 'Eliminando...' : 'Eliminar paciente'}
            </button>
          )}
        </div>
      </article>

      {showDeleteConfirm && (
        <ConfirmDeleteModal
          patientName={current.full_name || 'este paciente'}
          busy={deleting}
          error={deleteError}
          onConfirm={deletePatient}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

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
          key={current?.id}
          patient={current}
          onCancel={() => setShowEvaluation(false)}
          onCreated={() => {
            setShowEvaluation(false);
            refreshRecord();
          }}
        />
      )}

      {editingEvaluation && (
        <EvaluationForm
          key={`edit-${editingEvaluation.id}`}
          patient={current}
          editingEvaluation={editingEvaluation}
          onCancel={() => setEditingEvaluation(null)}
          onUpdated={() => {
            setEditingEvaluation(null);
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

      {(loading || isRefetching) && !record && (
        <section className="card" aria-busy="true">
          <SkeletonList rows={3} label="Cargando expediente…" />
        </section>
      )}

      {error && !record && (
        <section className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <p className="error" role="alert" style={{ marginBottom: '1rem' }}>
            No se pudo cargar el expediente clínico.
            {error.message ? ` (${error.message})` : ''}
          </p>
          <p className="muted" style={{ marginBottom: '1rem' }}>
            Esto puede ser un error transitorio de red o del servidor. Tus datos están seguros.
          </p>
          <button type="button" onClick={() => refetch()} disabled={isRefetching}>
            {isRefetching ? 'Reintentando...' : 'Reintentar'}
          </button>
        </section>
      )}

      {(!error || record) && (
        <>
          <ClinicalTimeline items={timeline} />
          <ClinicalSummary summary={summary} nextSession={nextSession} />

          {showSessionNote && (
            <SessionNoteEditor
              patientId={current.id}
              sessionNumber={nextSession}
              onCancel={() => setShowSessionNote(false)}
              onSaved={(saved) => {
                setShowSessionNote(false);
                // Instantly insert the saved note into the cache so the list
                // updates without waiting for the full record refetch.
                queryClient.setQueryData<ClinicalRecord>(['patient', patient.id], (old) => {
                  if (!old) return old;
                  const exists = (old.session_notes ?? []).some((n) => n.id === saved.id);
                  return {
                    ...old,
                    session_notes: exists
                      ? (old.session_notes ?? []).map((n) => (n.id === saved.id ? saved : n))
                      : [...(old.session_notes ?? []), saved]
                  };
                });
                refreshRecord();
              }}
            />
          )}

          {evaluations.length >= 2 && <EvaluationComparison evaluations={evaluations} />}

          <section className="card">
            <div className="form-header">
              <div>
                <p className="eyebrow">Valoraciones</p>
                <h2>Historial de valoracion</h2>
              </div>
              <span className="pill">{evaluations.length}</span>
            </div>
            <div className="list-stack">
              {evaluations.map((evaluation) => {
                const isOpen = openEvaluationId === evaluation.id;
                const yellowItems = evaluation.sections?.yellow_flags?.items;
                const yellowOther = evaluation.sections?.yellow_flags?.other;
                const yellowList = [...(yellowItems ?? []), yellowOther].filter(Boolean).join('; ');
                return (
                  <article key={evaluation.id} className="note-row">
                    <div className="form-header" style={{ alignItems: 'flex-start', gap: 8 }}>
                      <button
                        type="button"
                        className="note-toggle"
                        style={{ flex: 1 }}
                        onClick={() => setOpenEvaluationId(isOpen ? null : evaluation.id)}
                      >
                        <span>
                          <strong>{evaluation.evaluation_date}</strong>
                        </span>
                        {evaluation.eva_initial !== null &&
                          evaluation.eva_initial !== undefined && (
                            <span>EVA inicial {evaluation.eva_initial}/10</span>
                          )}
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        style={{ minHeight: 32, padding: '2px 10px', fontSize: '0.78rem' }}
                        onClick={() => setEditingEvaluation(evaluation)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        style={{ minHeight: 32, padding: '2px 10px', fontSize: '0.78rem' }}
                        onClick={() => printEvaluation(evaluation, current.full_name || '')}
                      >
                        PDF
                      </button>
                    </div>
                    <p style={{ marginTop: '0.5rem', marginBottom: '0.25rem' }}>
                      {evaluation.prognosis || 'Sin diagnostico fisioterapeutico registrado'}
                    </p>
                    {evaluation.red_flags && (
                      <p className="error" style={{ marginBottom: '0.25rem', fontSize: '0.85rem' }}>
                        🚩 {evaluation.red_flags}
                      </p>
                    )}
                    {yellowList && (
                      <p style={{ marginBottom: '0.25rem', fontSize: '0.85rem', color: '#b45309' }}>
                        ⚠ {yellowList}
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

          <AppointmentList
            patient={current}
            appointments={record?.appointments || []}
            onChanged={refreshRecord}
          />

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
                    <span>
                      {consult.created_at ? new Date(consult.created_at).toLocaleDateString() : ''}
                    </span>
                  </div>
                  <p className="muted">Validada: {consult.validated ? 'si' : 'pendiente'}</p>
                  <pre>{consult.output_text}</pre>
                </article>
              ))}
              {!aiConsults.length && <p className="muted">Aun no hay consultas IA trazables.</p>}
            </div>
          </section>
        </>
      )}
    </section>
  );
});
