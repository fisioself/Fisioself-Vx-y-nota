import { memo } from 'react';

export const ClinicalSummary = memo(function ClinicalSummary({ summary, nextSession }) {
  const evaTrend =
    summary.evaChange === null
      ? 'Sin tendencia'
      : summary.evaChange < 0
        ? `${Math.abs(summary.evaChange)} puntos menos`
        : summary.evaChange > 0
          ? `${summary.evaChange} puntos mas`
          : 'Sin cambio';

  return (
    <section className="card summary-card">
      <div className="form-header">
        <div>
          <p className="eyebrow">Resumen clinico</p>
          <h2>Estado del tratamiento</h2>
        </div>
        <span className="pill">Proxima #{nextSession}</span>
      </div>
      <div className="summary-grid">
        <div>
          <strong>{summary.sessionsCount}</strong>
          <span>sesiones</span>
        </div>
        <div>
          <strong>{summary.latestEva !== null ? `${summary.latestEva}/10` : 'S/EVA'}</strong>
          <span>EVA actual</span>
        </div>
        <div>
          <strong>{evaTrend}</strong>
          <span>cambio de dolor</span>
        </div>
      </div>
      <p>
        <strong>Diagnostico fisioterapeutico:</strong>{' '}
        {summary.diagnosis || 'Pendiente de registrar en valoracion.'}
      </p>
      <p className="muted">
        {summary.latestNotePreview
          ? `Ultima nota: ${summary.latestNotePreview}`
          : 'Aun no hay notas de sesion registradas.'}
      </p>
    </section>
  );
});
