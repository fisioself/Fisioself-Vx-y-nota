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
