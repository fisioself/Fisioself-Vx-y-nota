import { useState } from 'react';
import './AiConsultModal.css';

export function AiConsultModal({ consult, onClose, onSave }) {
  const [validated, setValidated] = useState(false);
  const [alsoInsert, setAlsoInsert] = useState(true);
  const [validationNotes, setValidationNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!consult) return null;

  const save = async () => {
    if (!validated) {
      setError('Debes confirmar revision clinica antes de guardar.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await onSave?.({
        ...consult,
        validated,
        alsoInsert,
        validationNotes: validationNotes.trim() || null
      });
      onClose?.();
    } catch (err) {
      setError(err.message || 'No se pudo guardar la consulta IA.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-consult-title"
      >
        <div className="form-header">
          <div>
            <p className="eyebrow">IA trazable</p>
            <h2 id="ai-consult-title">Revisar antes de guardar</h2>
          </div>
          <button type="button" className="secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <div className="warning-box">
          <strong>Validacion clinica obligatoria.</strong>
          <p>
            La IA puede ayudar a redactar, pero no sustituye el criterio del fisioterapeuta. Revisa
            el contenido antes de guardarlo en el expediente.
          </p>
          <p className="muted">
            Tu nota se envio a Anthropic (Claude) para generar este resultado. Entrada y salida
            quedan registradas en ai_consults para auditoria, accesibles solo por personal de tu
            clinica via RLS.
          </p>
        </div>

        <label>
          Resultado IA
          <textarea rows="10" value={consult.output} readOnly />
        </label>

        <label>
          Notas de validacion clinica
          <textarea
            rows="3"
            value={validationNotes}
            onChange={(e) => setValidationNotes(e.target.value)}
            placeholder="Ej. contenido revisado y ajustado al caso clinico..."
          />
        </label>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={validated}
            onChange={(e) => setValidated(e.target.checked)}
          />
          Confirmo que revise clinicamente esta respuesta antes de guardarla.
        </label>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={alsoInsert}
            onChange={(e) => setAlsoInsert(e.target.checked)}
          />
          Insertar tambien el resultado en la nota actual.
        </label>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div className="actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" onClick={save} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar IA trazable'}
          </button>
        </div>
      </section>
    </div>
  );
}
