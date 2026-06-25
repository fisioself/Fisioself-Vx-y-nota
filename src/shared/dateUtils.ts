// Devuelve la fecha en formato YYYY-MM-DD en horario de la clínica (CDMX), no en
// la zona del dispositivo. Antes usaba getTimezoneOffset() del navegador: en un
// equipo fuera de UTC-6 (viaje, VPN) "hoy" divergía y una nota/fecha marcada hoy
// en CDMX podía rechazarse como futura. Mismo criterio que financeUtils.today().
export const getLocalISODate = (date: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);

export const fmtDateMX = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
