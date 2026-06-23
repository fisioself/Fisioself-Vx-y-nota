export const getErrorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;

// Mensaje único para fallos de red, reutilizado por los formularios clínicos.
export const OFFLINE_MESSAGE =
  'Sin conexión. El borrador local está activo; los cambios se guardarán cuando vuelva la red.';

// ¿El error es un fallo de red del navegador (sin conexión / petición cortada),
// y no un rechazo de validación del servidor (PostgREST)?
// El mensaje del TypeError varía por navegador, así que no basta con compararlo
// contra "Failed to fetch":
//   Chrome:  "Failed to fetch"
//   Firefox: "NetworkError when attempting to fetch resource"
//   Safari:  "Load failed"
// Además, navigator.onLine === false es señal inequívoca de estar offline.
export const isOfflineError = (err: unknown): boolean => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (err instanceof TypeError) {
    const message = err.message.toLowerCase();
    return (
      message.includes('failed to fetch') ||
      message.includes('networkerror') ||
      message.includes('load failed') ||
      message.includes('network request failed')
    );
  }
  return false;
};
