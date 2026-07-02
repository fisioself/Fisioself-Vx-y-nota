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

// ---- Signos vitales fuera de referencia -----------------------------------
// Umbrales CONSERVADORES a propósito (marcan lo claramente anormal, no cada
// desviación leve) para que el ámbar no pierda significado. Valores vacíos o
// no numéricos devuelven false: sin dato no hay hallazgo.

const num = (value: string | null | undefined): number | null => {
  const n = parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

// SpO₂ < 92 % (y plausible: 0–100).
export const isSpo2Abnormal = (value: string | null | undefined): boolean => {
  const n = num(value);
  return n !== null && n > 0 && n <= 100 && n < 92;
};

// FC < 50 o > 110 lpm.
export const isHeartRateAbnormal = (value: string | null | undefined): boolean => {
  const n = num(value);
  return n !== null && n > 0 && (n < 50 || n > 110);
};

// FR < 10 o > 24 rpm.
export const isRespRateAbnormal = (value: string | null | undefined): boolean => {
  const n = num(value);
  return n !== null && n > 0 && (n < 10 || n > 24);
};

// TA "sistólica/diastólica": sist. ≥ 140 o < 90, diast. ≥ 90 o < 60.
export const isBloodPressureAbnormal = (value: string | null | undefined): boolean => {
  const match = String(value ?? '').match(/(\d{2,3})\s*[/-]\s*(\d{2,3})/);
  if (!match) return false;
  const sys = Number(match[1]);
  const dia = Number(match[2]);
  return sys >= 140 || sys < 90 || dia >= 90 || dia < 60;
};

// Causas rápidas de una lectura de SpO₂ poco confiable (chips en el formulario).
export const SPO2_QUALITY_REASONS = [
  'Manos frías',
  'Esmalte de uñas',
  'Mala perfusión',
  'Movimiento / temblor'
] as const;
