// Devuelve la fecha local en formato YYYY-MM-DD sin desplazamientos de zona
// horaria. Evita que un usuario en America vea la fecha del dia siguiente al
// trabajar de noche.
export const getLocalISODate = (date: Date = new Date()): string => {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60 * 1000);
  return localDate.toISOString().split('T')[0];
};

