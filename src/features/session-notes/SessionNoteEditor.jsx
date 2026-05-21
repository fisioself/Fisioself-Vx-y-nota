import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useToast } from '../../app/ToastProvider.jsx';
import { clinicalApi } from '../../services/clinicalApi.js';
import { aiService, AI_TYPES } from '../../services/aiService.js';
import { hasErrors, validateSessionNote } from '../../shared/clinicalValidation.js';
import { draftStorage, getDraftKey } from '../../shared/draftStorage.js';
import { AiConsultModal } from './AiConsultModal.jsx';
import { useDictation } from './useDictation.js';

const SOAP_TEMPLATE = `S - Subjetivo:
Motivo de la sesion, sintomas reportados, cambios desde la ultima visita.

O - Objetivo:
Intervenciones realizadas, ejercicios, movilidad, fuerza, dolor observado, respuesta al tratamiento.

A - Analisis:
Interpretacion clinica de la sesion, avances, limitaciones y tolerancia.

P - Plan:
Indicaciones, ejercicios en casa, progresion y proxima sesion.

Notas adicionales:
`;

export function SessionNoteEditor({
  patientId,
  therapistId,
  sessionNumber = 1,
  note,
  onSaved,
  onCancel
}) {
  const isEditing = Boolean(note?.id);
  const [sessionDate, setSessionDate] = useState(
    note?.session_date || new Date().toISOString().slice(0, 10)
  );
  const [eva, setEva] = useState(note?.eva ?? '');
  const [rawText, setRawText] = useState(note?.raw_text || '');
  const [aiBusy, setAiBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pendingConsult, setPendingConsult] = useState(null);
  const { notify } = useToast();
  const draftKey = useMemo(
    () => getDraftKey({ patientId, sessionNumber }),
    [patientId, sessionNumber]
  );

  useEffect(() => {
    if (isEditing) {
      setSessionDate(note?.session_date || new Date().toISOString().slice(0, 10));
      setEva(note?.eva ?? '');
      setRawText(note?.raw_text || '');
      return;
    }

    const savedDraft = draftStorage.get(draftKey);
    setRawText(savedDraft);
  }, [draftKey, isEditing, note]);

  useEffect(() => {
    if (isEditing) return;
    draftStorage.set(draftKey, rawText);
  }, [draftKey, isEditing, rawText]);

  const dictation = useDictation((chunk) => {
    setRawText((current) => (current ? `${current} ${chunk}` : chunk));
  });

  const runAi = async (type) => {
    setAiBusy(true);
    setError('');
    try {
      const output = await aiService.transform({ text: rawText, type: type.id });

      if (type.traceable) {
        setPendingConsult({
          type: type.id,
          label: type.label,
          input: rawText,
          output
        });
        return;
      }

      setRawText((current) =>
        type.id === 'soap' ? output : `${current}\n\n---\n## ${type.label}\n${output}`
      );
      notify({ tone: 'success', message: `${type.label} aplicado.` });
    } catch (err) {
      setError(err.message || 'No se pudo usar IA.');
      notify({ tone: 'error', message: err.message || 'No se pudo usar IA.' });
    } finally {
      setAiBusy(false);
    }
  };

  const savePendingConsult = async ({
    type,
    input,
    output,
    validated,
    validationNotes,
    alsoInsert,
    label
  }) => {
    if (!patientId) throw new Error('Selecciona un paciente antes de guardar IA.');

    await clinicalApi.addAiConsult({
      patient_id: patientId,
      therapist_id: therapistId || null,
      type,
      input_text: input,
      output_text: output,
      validated,
      validation_notes: validationNotes
    });

    if (alsoInsert) {
      setRawText((current) => `${current}\n\n---\n## ${label || type}\n${output}`);
    }

    notify({ tone: 'success', message: 'Consulta IA guardada en expediente.' });
    onSaved?.();
  };

  const discardDraft = () => {
    setRawText('');
    setEva('');
    draftStorage.remove(draftKey);
    notify({ tone: 'success', message: 'Borrador descartado.' });
  };

  const insertSoapTemplate = () => {
    setRawText((current) => {
      if (!current.trim()) return SOAP_TEMPLATE;
      return `${current.trim()}\n\n---\n${SOAP_TEMPLATE}`;
    });
  };

  const save = async () => {
    const payload = {
      patient_id: patientId,
      therapist_id: therapistId || null,
      session_number: sessionNumber,
      session_date: sessionDate,
      eva: eva === '' ? null : Number(eva),
      raw_text: rawText
    };

    const validation = validateSessionNote(payload);
    if (hasErrors(validation)) {
      const message = Object.values(validation)[0];
      setError(message);
      notify({ tone: 'warning', message });
      return;
    }

    setSaving(true);
    setError('');
    try {
      const saved = await clinicalApi.addSessionNote(payload);
      setRawText('');
      setEva('');
      draftStorage.remove(draftKey);
      notify({ tone: 'success', message: 'Nota guardada en expediente.' });
      onSaved?.(saved);
    } catch (err) {
      setError(err.message || 'No se pudo guardar la nota.');
      notify({ tone: 'error', message: err.message || 'No se pudo guardar la nota.' });
    } finally {
      setSaving(false);
    }
  };

  const update = async () => {
    if (!note?.id) return;

    const payload = {
      patient_id: patientId,
      therapist_id: therapistId || null,
      session_number: sessionNumber,
      session_date: sessionDate,
      eva: eva === '' ? null : Number(eva),
      raw_text: rawText
    };

    const validation = validateSessionNote(payload);
    if (hasErrors(validation)) {
      const message = Object.values(validation)[0];
      setError(message);
      notify({ tone: 'warning', message });
      return;
    }

    setSaving(true);
    setError('');
    try {
      const saved = await clinicalApi.updateSessionNote(note.id, payload);
      setRawText('');
      setEva('');
      draftStorage.remove(draftKey);
      notify({ tone: 'success', message: 'Nota actualizada.' });
      onSaved?.(saved);
    } catch (err) {
      setError(err.message || 'No se pudo actualizar la nota.');
      notify({ tone: 'error', message: err.message || 'No se pudo actualizar la nota.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card editor">
      <div className="form-header">
        <div>
          <p className="eyebrow">Nota de sesion</p>
          <h2>{isEditing ? `Editar sesion #${sessionNumber}` : `Sesion #${sessionNumber}`}</h2>
        </div>
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>

      <div className="row wrap">
        <label>
          Fecha de la sesion
          <input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} />
        </label>
        <label>
          EVA hoy
          <input
            type="number"
            min="0"
            max="10"
            value={eva}
            onChange={(e) => setEva(e.target.value)}
            placeholder="0-10"
          />
        </label>
        <span className="pill">Nota #{sessionNumber}</span>
        {rawText.trim() && <span className="pill">Borrador local activo</span>}
        <button type="button" className="secondary" onClick={insertSoapTemplate}>
          Usar plantilla SOAP
        </button>
        {dictation.supported && (
          <button
            type="button"
            className={dictation.listening ? 'danger' : 'secondary'}
            onClick={dictation.toggle}
          >
            {dictation.listening ? 'Detener dictado' : 'Dictar por voz'}
          </button>
        )}
      </div>

      <label>
        Nota de sesion en formato SOAP
        <textarea
          rows="10"
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder={`S - Subjetivo: como llega el paciente y que refiere.
O - Objetivo: que se trabajo, ejercicios, tecnica y respuesta.
A - Analisis: interpretacion clinica de la sesion.
P - Plan: indicaciones y siguiente paso.
Notas adicionales: cualquier detalle relevante.`}
        />
      </label>

      <div className="ai-box">
        <p>Asistente IA</p>
        <div className="row wrap">
          {AI_TYPES.map((type) => (
            <button
              key={type.id}
              type="button"
              className="secondary"
              disabled={aiBusy}
              onClick={() => runAi(type)}
            >
              {aiBusy ? '...' : type.label}
            </button>
          ))}
        </div>
        <small>La IA ayuda a redactar. La decision clinica siempre es del fisioterapeuta.</small>
      </div>

      {rawText.trim() && (
        <details>
          <summary>Vista previa</summary>
          <div className="markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{rawText}</ReactMarkdown>
          </div>
        </details>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="actions">
        {rawText.trim() && (
          <button type="button" className="secondary" onClick={discardDraft}>
            {isEditing ? 'Limpiar cambios' : 'Descartar borrador'}
          </button>
        )}
        <button type="button" onClick={isEditing ? update : save} disabled={saving}>
          {saving
            ? 'Guardando...'
            : isEditing
              ? `Actualizar sesion #${sessionNumber}`
              : `Guardar sesion #${sessionNumber}`}
        </button>
      </div>

      <AiConsultModal
        consult={pendingConsult}
        onClose={() => setPendingConsult(null)}
        onSave={savePendingConsult}
      />
    </section>
  );
}
