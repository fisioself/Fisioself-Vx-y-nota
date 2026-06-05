// Fuente ÚNICA de verdad para el código de color de Google Calendar que marca
// una cita como VALORACIÓN (primera visita). Las valoraciones se reportan aparte
// de las sesiones cobradas y NO consumen sesión de paquete.
//
//   '3' = Grape (morado)  → color actual para valoraciones NUEVAS.
//   '9' = Blueberry (azul) y '1' = Lavender → valoraciones HISTÓRICAS (antes del
//         cambio a morado). Se siguen reconociendo para no perder su conteo.
//
// El mismo conjunto vive en SQL (finance_appt_stats, monthly_finance_report) y en
// la edge function google-calendar-fetch (resolveSessionType). Si cambias esto,
// cámbialo también allá para que las métricas no se desincronicen.
export const VALORACION_COLOR_IDS = ['3', '9', '1'] as const;

// colorId que se asigna a una valoración NUEVA creada desde la app (morado/Grape).
export const VALORACION_COLOR_ID = '3';

export const isValoracionColorId = (colorId?: string | null): boolean =>
  colorId != null && (VALORACION_COLOR_IDS as readonly string[]).includes(colorId);

// Fragmento para PostgREST `.or()`: deja sesiones cobradas y excluye valoraciones
// (cualquiera de los colores morados). Mantiene color_id NULL = sesión clínica.
export const NOT_VALORACION_OR_FILTER = `color_id.is.null,color_id.not.in.(${VALORACION_COLOR_IDS.join(
  ','
)})`;
