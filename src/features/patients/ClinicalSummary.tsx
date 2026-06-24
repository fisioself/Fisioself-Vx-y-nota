import { memo } from 'react';

interface EvaPoint {
  date: string;
  value: number;
}

interface SummaryData {
  sessionsCount: number;
  latestEva: number | null;
  evaChange: number | null;
  evaHistory: EvaPoint[];
  diagnosis: string | null;
  latestNotePreview: string | null;
}

interface ClinicalSummaryProps {
  summary: SummaryData;
  nextSession: number;
}

function EvaSparkline({ data }: { data: EvaPoint[] }) {
  if (data.length < 2) return null;
  const W = 140;
  const H = 44;
  const PAD = 4;
  const xs = data.map((_, i) => PAD + (i / (data.length - 1)) * (W - PAD * 2));
  const ys = data.map((d) => PAD + ((10 - d.value) / 10) * (H - PAD * 2));
  const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(' ');
  const lastX = xs[xs.length - 1];
  const lastY = ys[ys.length - 1];
  const firstY = ys[0];
  const improved = lastY > firstY; // higher Y = lower EVA = better
  const color = improved ? '#1f9d57' : lastY < firstY ? '#c0392b' : '#52606d';
  return (
    <svg
      width={W}
      height={H}
      aria-label={`Evolución EVA: ${data.map((d) => d.value).join(' → ')}`}
      style={{ display: 'block', marginTop: 4 }}
    >
      <path
        d={path}
        stroke={color}
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {data.map((d, i) => (
        <circle key={i} cx={xs[i].toFixed(1)} cy={ys[i].toFixed(1)} r="3" fill={color} />
      ))}
      <text x={lastX + 5} y={lastY + 4} fontSize="10" fill={color} fontWeight="700">
        {data[data.length - 1].value}
      </text>
    </svg>
  );
}

export const ClinicalSummary = memo(function ClinicalSummary({
  summary,
  nextSession
}: ClinicalSummaryProps) {
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
          <EvaSparkline data={summary.evaHistory} />
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
