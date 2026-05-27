import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useToast } from '../../app/ToastProvider.jsx';
import { clinicalApi } from '../../services/clinicalApi';
import { aiService, AI_TYPES } from '../../services/aiService.js';
import { getLocalISODate } from '../../shared/dateUtils.js';
import { hasErrors, validateSessionNote } from '../../shared/clinicalValidation.js';
import { consent, CONSENT_KEYS } from '../../shared/consent.js';
import { draftStorage, getDraftKey } from '../../shared/draftStorage.js';
import { useDraftAutosave } from '../../shared/useDraftAutosave.js';
import { useShortcuts } from '../../shared/useShortcuts.js';
import { AiConsultModal } from './AiConsultModal.jsx';
import { ConsentGate } from './ConsentGate.jsx';
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
  const [sessionDate, setSessionDate] = useState('');
  const [eva, setEva] = useState('');
  const [rawText, setRawText] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pendingConsult, setPendingConsult] = useState(null);
  const [aiConsentRequest, setAiConsentRequest] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const { notify } = useToast();

  const draftKey = useMemo(
    () => getDraftKey({ patientId, sessionNumber, noteId: note?.id }),
    [patientId, sessionNumber, note?.id]
  );

  const draftValues = useMemo(() => ({
    sessionDate,
    eva,
    rawText
  }), [sessionDate, eva, rawText]);

  // Inicialización única por ID de nota o sesión nueva
  useEffect(() => {
    const savedDraft = draftStorage.get(draftKey);
    let draftData = null;
    if (savedDraft) {
      try {
        draftData = JSON.parse(savedDraft);
      } catch {
        // Fallback para borradores antiguos que eran solo string
        draftData = { rawText: savedDraft };
      }
    }

    if (isEditing) {
      // Priorizar el borrador local incluso al editar, si existe y tiene contenido
      setSessionDate(draftData?.sessionDate || note?.session_date || getLocalISODate());
      setEva(draftData?.eva ?? note?.eva ?? '');
      setRawText(draftData?.rawText || note?.raw_text || '');
      // Si el borrador es diferente a la nota original, marcar como sucio
      if (draftData && (draftData.rawText !== note?.raw_text || draftData.eva !== note?.eva)) {
        setIsDirty(true);
      }
    } else {
      setSessionDate(draftData?.sessionDate || getLocalISODate());
      setEva(draftData?.eva ?? '');
      setRawText(draftData?.rawText || '');
    }
    setIsDirty(false);
  }, [note?.id, draftKey, isEditing]); // Dependemos del ID, no del objeto completo

  // Guardar borrador automáticamente (solo si hay cambios)
  useDraftAutosave(isDirty ? draftKey : null, draftValues);

  const handleTextChange = (val) => {
    setRawText(val);
    setIsDirty(true);
  };

  const dictation = useDictation(
    (chunk) => {
      handleTextChange(rawText ? `${rawText} ${chunk}` : chunk);
    },
    (message) => {
      notify({ tone: 'error', message });
    }
  );

  const executeAi = async (type) => {
    setAiBusy(true);
    setError('');
    
    const startText = rawText;
    const prefix = type.id === 'soap' ? '' : `${startText}\n\n---\n## ${type.label}\n`;

    if (type.traceable) {
      setPendingConsult({
        type: type.id,
        label: type.label,
        input: rawText,
        output: ''
      });
    } else {
      setRawText(prefix);
      setIsDirty(true);
    }

    try {
      await aiService.transform({
        text: startText,
        type: type.id,
        onChunk: (accumulatedText) => {
          if (type.traceable) {
            setPendingConsult((current) => current ? { ...current, output: accumulatedText } : current);
          } else {
            setRawText(prefix + accumulatedText);
            setIsDirty(true);
          }
        }
      });

      if (!type.traceable) {
        notify({ tone: 'success', message: `${type.label} aplicado.` });
      }
    } catch (err) {
      setError(err.message || 'No se pudo usar IA.');
      notify({ tone: 'error', message: err.message || 'No se pudo usar IA.' });
      if (type.traceable) {
        setPendingConsult(null);
      }
    } finally {
      setAiBusy(false);
    }
  };

  // Gate: first AI use on this device shows a disclosure. The fisio confirms
  // they have patient consent before the note text leaves the browser.
  const runAi = (type) => {
    if (!consent.has(CONSENT_KEYS.AI)) {
      setAiConsentRequest(type);
      return;
    }
    executeAi(type);
  };

  const grantAiConsentAndRun = () => {
    const type = aiConsentRequest;
    consent.grant(CONSENT_KEYS.AI);
    setAiConsentRequest(null);
    if (type) executeAi(type);
  };

  const cancelAiConsent = () => setAiConsentRequest(null);

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
      handleTextChange(`${rawText}\n\n---\n## ${label || type}\n${output}`);
    }

    notify({ tone: 'success', message: 'Consulta IA guardada en expediente.' });
    // onSaved?.(); // Eliminamos el refresco automático para evitar que el padre destruya el estado local mientras se edita
  };

  const discardDraft = () => {
    setRawText(isEditing ? note.raw_text : '');
    setEva(isEditing ? note.eva : '');
    setIsDirty(false);
    draftStorage.remove(draftKey);
    notify({ tone: 'success', message: 'Borrador descartado.' });
  };

  useShortcuts([
    {
      key: 's',
      ctrl: true,
      shift: false,
      action: () => {
        if (!saving && isDirty) {
          isEditing ? update() : save();
        }
      }
    },
    {
      key: 'd',
      ctrl: true,
      shift: false,
      action: () => {
        if (dictation.supported && !aiBusy) {
          dictation.toggle();
        }
      }
    }
  ]);

  const insertSoapTemplate = () => {
    handleTextChange(rawText.trim() ? `${rawText.trim()}\n\n---\n${SOAP_TEMPLATE}` : SOAP_TEMPLATE);
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
      draftStorage.remove(draftKey);
      setIsDirty(false);
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
      draftStorage.remove(draftKey);
      setIsDirty(false);
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
          <input
            type="date"
            value={sessionDate}
            onChange={(e) => {
              setSessionDate(e.target.value);
              setIsDirty(true);
            }}
          />
        </label>
        <label>
          EVA hoy
          <input
            type="number"
            min="0"
            max="10"
            value={eva}
            onChange={(e) => {
              setEva(e.target.value);
              setIsDirty(true);
            }}
            placeholder="0-10"
          />
        </label>
        <span className="pill">Nota #{sessionNumber}</span>
        {isDirty && <span className="pill alert">Borrador local con cambios</span>}
        <button type="button" className="secondary" onClick={insertSoapTemplate}>
          Usar plantilla SOAP
        </button>
        {dictation.supported && (
          <button
            type="button"
            className={dictation.listening ? 'danger' : 'secondary'}
            onClick={dictation.toggle}
            disabled={dictation.processing}
          >
            {dictation.processing 
              ? 'Transcribiendo...' 
              : (dictation.listening ? 'Detener dictado' : 'Dictar por voz (Whisper)')}
          </button>
        )}
      </div>

      <label>
        Nota de sesion en formato SOAP
        <textarea
          rows="10"
          value={rawText}
          onChange={(e) => handleTextChange(e.target.value)}
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

      <ConsentGate
        open={Boolean(aiConsentRequest)}
        eyebrow="Asistencia IA"
        title="La nota se procesa con Anthropic"
        bullets={[
          'El texto de la nota se envia a la API de Anthropic (Claude) via tu Edge Function.',
          'La entrada y salida quedan guardadas en ai_consults para auditoria (RLS protegida).',
          'No envies datos del paciente sin su consentimiento informado.',
          'Toda salida IA es asistencia: la responsabilidad clinica es del fisioterapeuta.'
        ]}
        acceptLabel="Entendido, usar IA"
        onAccept={grantAiConsentAndRun}
        onCancel={cancelAiConsent}
      />
    </section>
  );
}
