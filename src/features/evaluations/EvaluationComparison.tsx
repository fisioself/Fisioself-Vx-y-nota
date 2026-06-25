import { useMemo, useState } from 'react';
import type { Evaluation, EvaluationZone } from '../../types/clinical';
import './EvaluationComparison.css';

interface EvaluationComparisonProps {
  // Lista de valoraciones del paciente, ordenada de más reciente a más antigua.
  evaluations: Evaluation[];
}

interface RomDelta {
  key: string;
  label: string;
  initial: string;
  current: string;
}

const fmtDate = (iso?: string | null) =>
  iso
    ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso).toLocaleDateString(
        'es-MX',
        { day: '2-digit', month: 'short', year: 'numeric' }
      )
    : '—';

// Construye un índice movimiento→grados afectado de todas las zonas.
const romIndex = (ev: Evaluation): Map<string, string> => {
  const map = new Map<string, string>();
  for (const zone of (ev.sections?.zones || []) as EvaluationZone[]) {
    for (const r of zone.movement_ranges || []) {
      if (r.movement && r.degrees) {
        map.set(`${zone.zone || ''} · ${r.movement} (${r.type || '—'})`, String(r.degrees));
      }
    }
  }
  return map;
};

const strengthIndex = (ev: Evaluation): Map<string, string> => {
  const map = new Map<string, string>();
  for (const zone of (ev.sections?.zones || []) as EvaluationZone[]) {
    for (const r of zone.muscle_strength || []) {
      if (r.muscle && r.daniels) {
        map.set(`${zone.zone || ''} · ${r.muscle}`, String(r.daniels));
      }
    }
  }
  return map;
};

// Empareja dos índices y devuelve solo las claves presentes en ambos.
const pairMatches = (initial: Map<string, string>, current: Map<string, string>): RomDelta[] => {
  const rows: RomDelta[] = [];
  for (const [key, curVal] of current) {
    const iniVal = initial.get(key);
    if (iniVal != null) {
      rows.push({ key, label: key, initial: iniVal, current: curVal });
    }
  }
  return rows;
};

const numericDelta = (a?: number | null, b?: number | null): string => {
  if (a == null || b == null) return '';
  const d = b - a;
  if (d === 0) return ' (=)';
  return d > 0 ? ` (+${d})` : ` (${d})`;
};

export function EvaluationComparison({ evaluations }: EvaluationComparisonProps) {
  const [open, setOpen] = useState(false);

  const data = useMemo(() => {
    if (evaluations.length < 2) return null;
    const current = evaluations[0];
    const initial = evaluations[evaluations.length - 1];
    const romRows = pairMatches(romIndex(initial), romIndex(current));
    const strengthRows = pairMatches(strengthIndex(initial), strengthIndex(current));
    return { current, initial, romRows, strengthRows };
  }, [evaluations]);

  if (!data) return null;
  const { current, initial, romRows, strengthRows } = data;
  const fInit = initial.sections?.functional_scales;
  const fCur = current.sections?.functional_scales;

  return (
    <section className="card eval-comparison">
      <button
        type="button"
        className="note-toggle"
        onClick={() => setOpen((v) => !v)}
        style={{ width: '100%' }}
      >
        <span>
          <strong>Comparativo de progreso</strong> · inicial ({fmtDate(initial.evaluation_date)}) →
          actual ({fmtDate(current.evaluation_date)})
        </span>
        <span>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="eval-comparison-body">
          <div className="cmp-row cmp-head">
            <span>Indicador</span>
            <span>Inicial</span>
            <span>Actual</span>
          </div>

          <div className="cmp-row">
            <span>EVA (dolor)</span>
            <span>{initial.eva_initial ?? '—'}</span>
            <span>
              {current.eva_initial ?? '—'}
              <em>{numericDelta(initial.eva_initial, current.eva_initial)}</em>
            </span>
          </div>

          {(fInit?.name || fCur?.name || fInit?.score || fCur?.score) && (
            <div className="cmp-row">
              <span>Escala funcional</span>
              <span>
                {fInit?.name ? `${fInit.name}: ` : ''}
                {fInit?.score || '—'}
              </span>
              <span>
                {fCur?.name ? `${fCur.name}: ` : ''}
                {fCur?.score || '—'}
              </span>
            </div>
          )}

          {romRows.length > 0 && (
            <>
              <div className="cmp-section-title">Rangos de movimiento (grados, lado afectado)</div>
              {romRows.map((r) => (
                <div className="cmp-row" key={r.key}>
                  <span>{r.label}</span>
                  <span>{r.initial}°</span>
                  <span>
                    {r.current}°<em>{numericDelta(Number(r.initial), Number(r.current))}</em>
                  </span>
                </div>
              ))}
            </>
          )}

          {strengthRows.length > 0 && (
            <>
              <div className="cmp-section-title">Fuerza (Daniels)</div>
              {strengthRows.map((r) => (
                <div className="cmp-row" key={r.key}>
                  <span>{r.label}</span>
                  <span>{r.initial}</span>
                  <span>{r.current}</span>
                </div>
              ))}
            </>
          )}

          {romRows.length === 0 && strengthRows.length === 0 && (
            <p className="muted" style={{ marginTop: 8, fontSize: '0.85rem' }}>
              No hay movimientos o músculos en común entre ambas valoraciones para comparar grados.
              El EVA y la escala funcional sí se comparan arriba.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
