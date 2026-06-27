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

// Edad en años a partir de la fecha de nacimiento (ISO o fecha parseable).
// '' si no aplica. Se ancla a mediodía para no correrse un día por zona horaria.
export const computeAge = (birth: string | null | undefined): string => {
  if (!birth) return '';
  const b = new Date(/^\d{4}-\d{2}-\d{2}$/.test(birth) ? `${birth}T12:00:00` : birth);
  if (Number.isNaN(b.getTime())) return '';
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age -= 1;
  return age >= 0 && age < 130 ? String(age) : '';
};
