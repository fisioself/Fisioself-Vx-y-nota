// Fuente ÚNICA de verdad para el código de color de Google Calendar que marca
// una cita como VALORACIÓN (primera visita). Las valoraciones se reportan aparte
// de las sesiones cobradas y NO consumen sesión de paquete.
//
//   '9' = Blueberry/Índigo (azul) → color actual para valoraciones NUEVAS.
//   '3' = Grape (morado) y '1' = Lavender → también reconocidos como valoración
//         (se usaron antes) para no perder su conteo histórico.
//
// El mismo conjunto vive en SQL (finance_appt_stats, monthly_finance_report) y en
// la edge function google-calendar-fetch (resolveSessionType). Si cambias esto,
// cámbialo también allá para que las métricas no se desincronicen.
export const VALORACION_COLOR_IDS = ['3', '9', '1'] as const;

// colorId que se asigna a una valoración NUEVA creada desde la app (Índigo azul).
export const VALORACION_COLOR_ID = '9';

export const isValoracionColorId = (colorId?: string | null): boolean =>
  colorId != null && (VALORACION_COLOR_IDS as readonly string[]).includes(colorId);

// Fragmento para PostgREST `.or()`: deja sesiones cobradas y excluye valoraciones
// (cualquiera de los colores morados). Mantiene color_id NULL = sesión clínica.
export const NOT_VALORACION_OR_FILTER = `color_id.is.null,color_id.not.in.(${VALORACION_COLOR_IDS.join(
  ','
)})`;
