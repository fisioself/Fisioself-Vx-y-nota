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

export function SessionNoteEditor({ patientId, therapistId, sessionNumber = 1, onSaved }) {
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().slice(0, 10));
  const [eva, setEva] = useState('');
  const [rawText, setRawText] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pendingConsult, setPendingConsult] = useState(null);
  const { notify } = useToast();
  const draftKey = useMemo(() => getDraftKey({ patientId, sessionNumber }), [patientId, sessionNumber]);

  useEffect(() => {
    const savedDraft = draftStorage.get(draftKey);
    setRawText(savedDraft);
  }, [draftKey]);

  useEffect(() => {
    draftStorage.set(draftKey, rawText);
  }, [draftKey, rawText]);

  const dictation = useDictation((chunk) => {
    setRawText((current) => current ? `${current} ${chunk}` : chunk);
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

      setRawText((current) => type.id === 'soap'
        ? output
        : `${current}\n\n---\n## ${type.label}\n${output}`);
      notify({ tone: 'success', message: `${type.label} aplicado.` });
    } catch (err) {
      setError(err.message || 'No se pudo usar IA.');
      notify({ tone: 'error', message: err.message || 'No se pudo usar IA.' });
    } finally {
      setAiBusy(false);
    }
  };

  const savePendingConsult = async ({ type, input, output, validated, validationNotes, alsoInsert, label }) => {
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

  return (
    <section className="card editor">
      <div className="row wrap">
        <label>
          Fecha
          <input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} />
        </label>
        <label>
          EVA hoy
          <input type="number" min="0" max="10" value={eva} onChange={(e) => setEva(e.target.value)} placeholder="0-10" />
        </label>
        <span className="pill">Sesion #{sessionNumber}</span>
        {rawText.trim() && <span className="pill">Borrador local activo</span>}
        {dictation.supported && (
          <button type="button" className={dictation.listening ? 'danger' : 'secondary'} onClick={dictation.toggle}>
            {dictation.listening ? 'Detener dictado' : 'Dictar por voz'}
          </button>
        )}
      </div>

      <label>
        Nota clinica
        <textarea rows="10" value={rawText} onChange={(e) => setRawText(e.target.value)} placeholder="Escribe o dicta la nota de sesion..." />
      </label>

      <div className="ai-box">
        <p>Asistente IA</p>
        <div className="row wrap">
          {AI_TYPES.map((type) => (
            <button key={type.id} type="button" className="secondary" disabled={aiBusy} onClick={() => runAi(type)}>
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

      {error && <p className="error" role="alert">{error}</p>}

      <div className="actions">
        {rawText.trim() && <button type="button" className="secondary" onClick={discardDraft}>Descartar borrador</button>}
        <button type="button" onClick={save} disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar nota'}
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
