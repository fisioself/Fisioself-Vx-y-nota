import { useEffect, useMemo, useRef, useState } from 'react';
import { getPromScale, type PromResult } from './promsCatalog';

interface PromCalculatorProps {
  scaleId: string;
  // Se llama cada vez que cambia el resultado calculado (o null si incompleto).
  onResult: (result: PromResult | null) => void;
}

// Renderiza las preguntas de una escala PROM y calcula puntaje + interpretación
// en vivo. No guarda nada por sí mismo: emite el resultado al formulario padre.
export function PromCalculator({ scaleId, onResult }: PromCalculatorProps) {
  const scale = getPromScale(scaleId);
  const [answers, setAnswers] = useState<(number | null)[]>(() =>
    scale ? scale.questions.map(() => null) : []
  );

  // Reinicia las respuestas al cambiar de escala.
  useEffect(() => {
    setAnswers(scale ? scale.questions.map(() => null) : []);
  }, [scaleId, scale]);

  const result = useMemo(() => (scale ? scale.score(answers) : null), [scale, answers]);

  // Mantenemos onResult en un ref para no re-disparar el efecto si el padre pasa
  // una función nueva en cada render; solo nos interesa reaccionar al resultado.
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  useEffect(() => {
    onResultRef.current(result);
  }, [result]);

  if (!scale) return null;

  const answeredCount = answers.filter((a) => a != null).length;

  // Agrupa preguntas por su `group` preservando el orden.
  const groups: { group: string; items: { q: (typeof scale.questions)[number]; idx: number }[] }[] =
    [];
  scale.questions.forEach((q, idx) => {
    const key = q.group ?? '';
    let g = groups.find((x) => x.group === key);
    if (!g) {
      g = { group: key, items: [] };
      groups.push(g);
    }
    g.items.push({ q, idx });
  });

  return (
    <div className="prom-calculator">
      <p className="muted" style={{ margin: '4px 0 10px', fontSize: '0.85rem' }}>
        {scale.description}
      </p>

      {groups.map((g) => (
        <div key={g.group || 'default'} className="prom-group">
          {g.group && <p className="prom-group-title">{g.group}</p>}
          {g.items.map(({ q, idx }) => (
            <label key={idx} className="prom-question">
              <span>{q.text}</span>
              <select
                value={answers[idx] ?? ''}
                onChange={(e) => {
                  const v = e.target.value === '' ? null : Number(e.target.value);
                  setAnswers((cur) => cur.map((a, i) => (i === idx ? v : a)));
                }}
              >
                <option value="">—</option>
                {q.options.map((opt) => (
                  <option key={opt.label} value={opt.points}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      ))}

      <div className="prom-result">
        {result ? (
          <>
            <strong>{result.display}</strong>
            <span>{result.interpretation}</span>
          </>
        ) : (
          <span className="muted">
            Contesta {scale.minAnswered ?? scale.questions.length} ítems para calcular (
            {answeredCount}/{scale.questions.length}).
          </span>
        )}
      </div>
    </div>
  );
}
