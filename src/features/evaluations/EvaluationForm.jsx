import { useState } from 'react';
import { clinicalApi } from '../../services/clinicalApi.js';

const emptyEvaluation = {
  evaluation_date: new Date().toISOString().slice(0, 10),
  eva_initial: '',
  reason: '',
  red_flags: '',
  prognosis: '',
  goals: '',
  objective_findings: ''
};

export function EvaluationForm({ patientId, therapistId, onCreated, onCancel }) {
  const [values, setValues] = useState(emptyEvaluation);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const setField = (field, value) => {
    setValues((current) => ({ ...current, [field]: value }));
    setError('');
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!patientId) {
      setError('Selecciona un paciente antes de crear una valoracion.');
      return;
    }

    const eva = values.eva_initial === '' ? null : Number(values.eva_initial);
    if (eva !== null && (!Number.isFinite(eva) || eva < 0 || eva > 10)) {
      setError('EVA inicial debe estar entre 0 y 10.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const evaluation = await clinicalApi.addEvaluation({
        patient_id: patientId,
        therapist_id: therapistId || null,
        evaluation_date: values.evaluation_date,
        eva_initial: eva,
        red_flags: values.red_flags.trim() || null,
        prognosis: values.prognosis.trim() || null,
        sections: {
          reason: values.reason.trim(),
          goals: values.goals.trim(),
          objective_findings: values.objective_findings.trim()
        }
      });
      setValues(emptyEvaluation);
      onCreated?.(evaluation);
    } catch (err) {
      setError(err.message || 'No se pudo guardar la valoracion.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="card form-grid" onSubmit={submit}>
      <div className="form-header span-2">
        <div>
          <p className="eyebrow">Valoracion inicial</p>
          <h2>Nueva valoracion</h2>
        </div>
        {onCancel && <button type="button" className="secondary" onClick={onCancel}>Cancelar</button>}
      </div>

      <label>
        Fecha
        <input type="date" value={values.evaluation_date} onChange={(e) => setField('evaluation_date', e.target.value)} />
      </label>

      <label>
        EVA inicial
        <input type="number" min="0" max="10" value={values.eva_initial} onChange={(e) => setField('eva_initial', e.target.value)} placeholder="0-10" />
      </label>

      <label className="span-2">
        Motivo de consulta
        <textarea rows="3" value={values.reason} onChange={(e) => setField('reason', e.target.value)} />
      </label>

      <label className="span-2">
        Hallazgos objetivos
        <textarea rows="3" value={values.objective_findings} onChange={(e) => setField('objective_findings', e.target.value)} />
      </label>

      <label className="span-2">
        Banderas rojas
        <textarea rows="2" value={values.red_flags} onChange={(e) => setField('red_flags', e.target.value)} placeholder="Negadas / presentes / por derivar..." />
      </label>

      <label className="span-2">
        Pronostico y objetivos
        <textarea rows="3" value={values.prognosis} onChange={(e) => setField('prognosis', e.target.value)} />
      </label>

      <label className="span-2">
        Metas funcionales
        <textarea rows="3" value={values.goals} onChange={(e) => setField('goals', e.target.value)} />
      </label>

      {error && <p className="error span-2" role="alert">{error}</p>}

      <div className="actions span-2">
        <button type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Guardar valoracion'}</button>
      </div>
    </form>
  );
}
