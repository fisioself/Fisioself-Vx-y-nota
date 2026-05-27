/**
 * Devuelve la fecha local en formato YYYY-MM-DD sin desplazamientos de zona horaria (UTC).
 * Evita que usuarios en America vean la fecha del dia siguiente al trabajar de noche.
 */
export const getLocalISODate = (date = new Date()) => {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60 * 1000);
  return localDate.toISOString().split('T')[0];
};

/**
 * Formatea una fecha ISO para mostrarla de forma legible segun el locale del usuario.
 */
export const formatDisplayDate = (isoString) => {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch {
    return isoString;
  }
};
