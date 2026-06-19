import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useToast } from '../../app/ToastProvider';
import { clinicalApi } from '../../services/clinicalApi';
import { aiService, AI_TYPES } from '../../services/aiService';
import { getLocalISODate } from '../../shared/dateUtils';
import { hasErrors, validateSessionNote } from '../../shared/clinicalValidation';
import { consent, CONSENT_KEYS } from '../../shared/consent';
import { draftStorage, getDraftKey } from '../../shared/draftStorage';
import { useDraftAutosave } from '../../shared/useDraftAutosave';
import { useShortcuts } from '../../shared/useShortcuts';
import { AiConsultModal } from './AiConsultModal';
import { ConsentGate } from './ConsentGate';
import { useDictation } from './useDictation';
import type { AiConsultSavePayload, AiType, PendingConsult } from './types';
import type { SessionNote } from '../../types/clinical';
import { getErrorMessage } from '../../shared/errors';

interface SessionNoteEditorProps {
  patientId: string;
  therapistId?: string | null;
  sessionNumber?: number;
  note?: SessionNote | null;
  onSaved?: (saved: SessionNote) => void;
  onCancel?: () => void;
}

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

const CLINICAL_SNIPPETS = [
  {
    id: 'terapia-manual',
    label: 'Terapia Manual',
    text: 'Se aplica terapia manual ortopedica enfocada en liberacion miofascial y movilizacion articular (Grado I-III), logrando disminucion del tono muscular y mejora del ROM sin dolor agudo.'
  },
  {
    id: 'puncion-seca',
    label: 'Puncion Seca',
    text: 'Puncion seca en puntos gatillo miofasciales activos (PGM) con respuesta de espasmo local (REL) positiva. Se complementa con estiramiento pasivo.'
  },
  {
    id: 'descarga',
    label: 'Descarga',
    text: 'Sesion de descarga muscular global enfocada en tren inferior post-competicion. Masaje deportivo descontracturante, presoterapia y estiramientos neuromusculares (FNP).'
  },
  {
    id: 'ejercicio-terapeutico',
    label: 'Ejercicio Terapeutico',
    text: 'Prescripcion de ejercicio terapeutico: movilidad activa, fortalecimiento isometrico/isotonico progresivo y control motor. Tolerancia adecuada al esfuerzo.'
  }
];

export function SessionNoteEditor({
  patientId,
  therapistId,
  sessionNumber = 1,
  note,
  onSaved,
  onCancel
}: SessionNoteEditorProps) {
  const isEditing = Boolean(note?.id);
  const [sessionDate, setSessionDate] = useState('');
  const [eva, setEva] = useState<number | string>('');
  const [rawText, setRawText] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pendingConsult, setPendingConsult] = useState<PendingConsult | null>(null);
  const [aiConsentRequest, setAiConsentRequest] = useState<AiType | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const { notify } = useToast();

  const draftKey = useMemo(
    () => getDraftKey({ patientId, sessionNumber, noteId: note?.id }),
    [patientId, sessionNumber, note?.id]
  );

  const draftValues = useMemo(
    () => ({
      sessionDate,
      eva,
      rawText
    }),
    [sessionDate, eva, rawText]
  );

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

  const handleTextChange = (val: string) => {
    setRawText(val);
    setIsDirty(true);
  };

  const dictation = useDictation(
    (chunk) => {
      // Actualización funcional: una grabación puede tardar y el usuario puede
      // teclear mientras tanto; usar `rawText` capturado sobrescribiría esos
      // cambios. `setRawText((prev) => ...)` siempre parte del valor más reciente.
      setRawText((prev) => (prev ? `${prev} ${chunk}` : chunk));
      setIsDirty(true);
    },
    (message) => {
      notify({ tone: 'error', message });
    }
  );

  const aiAbortRef = useRef<AbortController | null>(null);

  // Al desmontar (cerrar el editor), aborta cualquier consulta IA en curso para
  // que sus onChunk no escriban en estado de un componente que ya no existe.
  useEffect(() => {
    return () => aiAbortRef.current?.abort();
  }, []);

  const executeAi = async (type: AiType) => {
    setAiBusy(true);
    setError('');

    const startText = rawText;
    const prefix = type.id === 'soap' ? '' : `${startText}\n\n---\n## ${type.label}\n`;

    // Cancela una consulta previa en vuelo y crea un controller para esta.
    aiAbortRef.current?.abort();
    const controller = new AbortController();
    aiAbortRef.current = controller;

    if (type.traceable) {
      setPendingConsult({
        type: type.id,
        label: type.label,
        input: rawText,
        output: ''
      });
    }
    // Para SOAP el prefix es '' (reemplaza la nota). ANTES se hacía
    // setRawText(prefix) aquí, borrando el textarea ANTES de la llamada: si la
    // IA fallaba, la nota quedaba vacía y perdida. Ahora NO tocamos el texto
    // hasta que llega el primer chunk (onChunk reconstruye prefix+acumulado),
    // así un fallo previo al primer chunk deja la nota original intacta.

    try {
      await aiService.transform({
        text: startText,
        type: type.id,
        signal: controller.signal,
        onChunk: (accumulatedText: string) => {
          if (type.traceable) {
            setPendingConsult((current) =>
              current ? { ...current, output: accumulatedText } : current
            );
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
      // Si esta consulta fue abortada (otra la reemplazó o se desmontó), no
      // tocamos nada: el dueño actual del texto es la nueva consulta.
      if (controller.signal.aborted) return;
      const message = getErrorMessage(err, 'No se pudo usar IA.');
      setError(message);
      notify({ tone: 'error', message });
      if (type.traceable) {
        setPendingConsult(null);
      } else {
        // Restaura el texto que tenía la nota antes de la consulta fallida.
        setRawText(startText);
      }
    } finally {
      if (aiAbortRef.current === controller) {
        aiAbortRef.current = null;
        setAiBusy(false);
      }
    }
  };

  // Gate: first AI use on this device shows a disclosure. The fisio confirms
  // they have patient consent before the note text leaves the browser.
  const runAi = (type: AiType) => {
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
  }: AiConsultSavePayload) => {
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
  };

  const discardDraft = () => {
    setRawText(isEditing && note ? note.raw_text : '');
    setEva(isEditing && note?.eva != null ? note.eva : '');
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
        if (!saving && isDirty) submit();
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

  const insertSnippet = (text: string) => {
    handleTextChange(rawText ? `${rawText}\n\n${text}` : text);
    notify({ tone: 'success', message: 'Plantilla insertada.' });
  };

  const submit = async () => {
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
      const message = Object.values(validation)[0] || 'Datos invalidos.';
      setError(message);
      notify({ tone: 'warning', message });
      return;
    }

    const successMessage = isEditing ? 'Nota actualizada.' : 'Nota guardada en expediente.';
    const failureFallback = isEditing
      ? 'No se pudo actualizar la nota.'
      : 'No se pudo guardar la nota.';

    setSaving(true);
    setError('');
    try {
      const saved =
        isEditing && note
          ? await clinicalApi.updateSessionNote(note.id, payload)
          : await clinicalApi.addSessionNote(payload);
      draftStorage.remove(draftKey);
      setIsDirty(false);
      notify({ tone: 'success', message: successMessage });
      onSaved?.(saved);
    } catch (err) {
      const message = getErrorMessage(err, failureFallback);
      setError(message);
      notify({ tone: 'error', message });
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
            min={0}
            max={10}
            step={0.5}
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
              : dictation.listening
                ? 'Detener dictado'
                : 'Dictar por voz (Whisper)'}
          </button>
        )}
      </div>

      <div className="filter-group" style={{ marginBottom: 12 }}>
        <p className="eyebrow" style={{ marginBottom: 4 }}>
          Plantillas Rapidas
        </p>
        <div className="row wrap filters">
          {CLINICAL_SNIPPETS.map((snippet) => (
            <button
              key={snippet.id}
              type="button"
              className="pill secondary"
              style={{ fontSize: '0.85rem', padding: '6px 10px' }}
              onClick={() => insertSnippet(snippet.text)}
            >
              + {snippet.label}
            </button>
          ))}
        </div>
      </div>

      <label>
        Nota de sesion en formato SOAP
        <textarea
          rows={10}
          value={rawText}
          onChange={(e) => handleTextChange(e.target.value)}
          maxLength={12000}
          aria-describedby="note-char-count"
          placeholder={`S - Subjetivo: como llega el paciente y que refiere.
O - Objetivo: que se trabajo, ejercicios, tecnica y respuesta.
A - Analisis: interpretacion clinica de la sesion.
P - Plan: indicaciones y siguiente paso.
Notas adicionales: cualquier detalle relevante.`}
        />
      </label>
      <p
        id="note-char-count"
        className={`char-counter${rawText.length > 10000 ? ' near-limit' : ''}`}
        aria-live="polite"
        aria-atomic="true"
      >
        {rawText.length.toLocaleString('es-MX')} / 12 000
      </p>

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
        <button type="button" onClick={submit} disabled={saving}>
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
        title="La nota se procesa con un servicio externo de IA"
        bullets={[
          'El texto de la nota se envia al servicio de IA configurado en tu Edge Function.',
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
