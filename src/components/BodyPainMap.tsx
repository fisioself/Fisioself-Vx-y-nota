import type { MouseEvent } from 'react';
import type { PainPoint } from '../types/clinical';
import './BodyPainMap.css';

interface BodyPainMapProps {
  value: PainPoint[];
  onChange?: (points: PainPoint[]) => void;
  readOnly?: boolean;
}

// Silueta humanoide simple (cabeza, tronco, brazos, piernas) en un viewBox
// 0 0 100 200. Misma forma para vista frontal y posterior.
function Silhouette() {
  return (
    <g className="bpm-body" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="0.8">
      <circle cx="50" cy="14" r="10" />
      <rect x="46" y="23" width="8" height="6" rx="2" />
      <rect x="33" y="28" width="34" height="58" rx="12" />
      <rect x="20" y="30" width="11" height="48" rx="5" />
      <rect x="69" y="30" width="11" height="48" rx="5" />
      <rect x="36" y="82" width="12" height="84" rx="5" />
      <rect x="52" y="82" width="12" height="84" rx="5" />
    </g>
  );
}

function BodyView({
  view,
  label,
  points,
  onAdd,
  onRemove,
  readOnly
}: {
  view: 'front' | 'back';
  label: string;
  points: PainPoint[];
  onAdd: (x: number, y: number) => void;
  onRemove: (index: number) => void;
  readOnly?: boolean;
}) {
  const viewPoints = points.map((p, i) => ({ p, i })).filter(({ p }) => p.view === view);

  const handleClick = (e: MouseEvent<SVGSVGElement>) => {
    if (readOnly) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100; // viewBox width = 100
    const y = ((e.clientY - rect.top) / rect.height) * 200; // viewBox height = 200
    onAdd(x, y);
  };

  return (
    <div className="bpm-view">
      <span className="bpm-view-label">{label}</span>
      <svg
        viewBox="0 0 100 200"
        className={`bpm-svg${readOnly ? ' bpm-readonly' : ''}`}
        onClick={handleClick}
        role="img"
        aria-label={`Mapa de dolor — vista ${label}`}
      >
        <Silhouette />
        {viewPoints.map(({ p, i }) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="3.2"
            className="bpm-point"
            onClick={(e) => {
              if (readOnly) return;
              e.stopPropagation();
              onRemove(i);
            }}
          />
        ))}
      </svg>
    </div>
  );
}

// Mapa corporal de dolor: el clínico marca con un toque dónde duele (frontal y
// posterior). Tocar un punto existente lo elimina. En readOnly solo muestra.
export function BodyPainMap({ value, onChange, readOnly }: BodyPainMapProps) {
  const addPoint = (view: 'front' | 'back') => (x: number, y: number) => {
    onChange?.([...value, { view, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }]);
  };
  const removePoint = (index: number) => {
    onChange?.(value.filter((_, i) => i !== index));
  };

  return (
    <div className="bpm-wrapper">
      {!readOnly && (
        <div className="bpm-head">
          <span className="muted">Toca dónde duele. Toca un punto para quitarlo.</span>
          {value.length > 0 && (
            <button type="button" className="eva-clear" onClick={() => onChange?.([])}>
              Limpiar mapa
            </button>
          )}
        </div>
      )}
      <div className="bpm-views">
        <BodyView
          view="front"
          label="Frontal"
          points={value}
          onAdd={addPoint('front')}
          onRemove={removePoint}
          readOnly={readOnly}
        />
        <BodyView
          view="back"
          label="Posterior"
          points={value}
          onAdd={addPoint('back')}
          onRemove={removePoint}
          readOnly={readOnly}
        />
      </div>
    </div>
  );
}
