// Detección de hallazgo "alterado" a partir de los datos ya persistidos de una
// fila de exploración. Vive en `shared` para que el formulario (features), el
// expediente y el PDF marquen exactamente lo mismo, sin que shared dependa de
// features. El rango ya viene autocalculado (≥ normal → Completo; si no →
// Limitado), así que basta con mirar el rango / Daniels / dolor guardados.

// ROM alterado: hay dolor o el rango quedó "Limitado".
export const isRomRowAltered = (
  range: string | null | undefined,
  pain: string | null | undefined
): boolean => pain === 'Sí' || range === 'Limitado';

// Fuerza alterada: hay dolor o Daniels < 5.
export const isStrengthRowAltered = (
  daniels: string | null | undefined,
  pain: string | null | undefined
): boolean => {
  if (pain === 'Sí') return true;
  const n = parseInt(daniels || '', 10);
  return Number.isFinite(n) && n < 5;
};
