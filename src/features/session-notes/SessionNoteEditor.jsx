import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { clinicalApi } from '../../services/clinicalApi.js';
import { aiService, AI_TYPES } from '../../services/aiService.js';
import { hasErrors, validateSessionNote } from '../../shared/clinicalValidation.js';
import { useDictation } from './useDictation.js';

export function SessionNoteEditor({ patientId, therapistId, sessionNumber = 1, onSaved }) {
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().slice(0, 10));
  const [eva, setEva] = useState('');
  const [rawText, setRawText] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const dictation = useDictation((chunk) => {
    setRawText((current) => current ? `${current} ${chunk}` : chunk);
  });

  const runAi = async (type) => {
    setAiBusy(true);
    setError('');
    try {
      const output = await aiService.transform({ text: rawText, type: type.id });
      setRawText((current) => type.id === 'soap'
        ? output
        : `${current}\n\n---\n## ${type.label}\n${output}`);

      if (type.traceable && patientId) {
        await clinicalApi.addAiConsult({
          patient_id: patientId,
          therapist_id: therapistId || null,
          type: type.id,
          input_text: rawText,
          output_text: output,
          validated: false
        });
      }
    } catch (err) {
      setError(err.message || 'No se pudo usar IA.');
    } finally {
      setAiBusy(false);
    }
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
      setError(Object.values(validation)[0]);
      return;
    }

    setSaving(true);
    setError('');
    try {
      const saved = await clinicalApi.addSessionNote(payload);
      setRawText('');
      setEva('');
      onSaved?.(saved);
    } catch (err) {
      setError(err.message || 'No se pudo guardar la nota.');
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
        <button type="button" onClick={save} disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar nota'}
        </button>
      </div>
    </section>
  );
}
