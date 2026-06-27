// La matemática de comisión vive en shared/financeMath (la usa también la capa
// de servicios); se reexporta aquí por compatibilidad de imports de la feature.
export { CARD_COMMISSION, cardCommission, netAfterCommission } from '../../shared/financeMath';

export const money = (n: number) =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(Number.isFinite(n) ? n : 0);

const MONTH_ABBR = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic'
];

export const monthLabel = (ym: string) => {
  const [, m] = ym.split('-');
  return MONTH_ABBR[Number(m) - 1] ?? ym;
};

// Etiqueta completa "junio 2026" a partir de 'YYYY-MM'. Usada en el historial
// mensual detallado y en el nombre del archivo exportado.
export const monthYearLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  return new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(
    new Date(y, m - 1, 1)
  );
};

// Fecha de hoy en CDMX (no UTC): de noche en CDMX, toISOString() daría el día siguiente.
export const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());

// Fecha (YYYY-MM-DD) de un ISO en CDMX. Se usa para que un cobro hecho desde la
// agenda se registre con la FECHA DE LA CITA (no la del día en que se captura).
// Devuelve undefined si no hay fecha, para que el RPC caiga a current_date.
export const cdmxDate = (iso: string | null | undefined): string | undefined => {
  if (!iso) return undefined;
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date(iso));
  } catch {
    return undefined;
  }
};

// Formatea una fecha ISO o "YYYY-MM-DD" como "2 jun · 14:30" en CDMX.
// Si el valor es solo fecha sin hora, omite la hora.
export const fmtDate = (iso: string): string => {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : iso + 'T12:00:00');
  const date = new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    timeZone: 'America/Mexico_City'
  }).format(d);
  if (!iso.includes('T')) return date;
  const time = new Intl.DateTimeFormat('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Mexico_City'
  }).format(d);
  return `${date} · ${time}`;
};

// Etiqueta corta de fecha+hora en CDMX, estilo "lun, 02 jun, 14:30". Usada en
// el modal de cobro para contextualizar la cita.
export const cdmxLabel = (iso: string | null): string => {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('es-MX', {
      timeZone: 'America/Mexico_City',
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date(iso));
  } catch {
    return '';
  }
};

export const methodLabel = (m: string) => {
  if (m === 'tarjeta' || m === 'transferencia') return 'Tarjeta / Trans.';
  if (m === 'efectivo') return 'Efectivo';
  return m;
};

export const EXPENSE_CATEGORIES = ['renta', 'material', 'servicios', 'nomina', 'otro'];

export const CATEGORY_COLORS: Record<string, string> = {
  renta: '#8e44ad',
  material: '#2980b9',
  servicios: '#16a085',
  nomina: '#d35400',
  otro: '#7f8c8d'
};
