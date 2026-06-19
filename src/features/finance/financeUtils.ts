export const CARD_COMMISSION = 0.0406;
// Lo que la terminal se queda (gasto de la clínica). El pago al paciente se
// registra en BRUTO; esta comisión se guarda aparte como gasto.
export const cardCommission = (gross: number) => Math.round(gross * CARD_COMMISSION * 100) / 100;
// Neto que realmente entra al banco. Solo para mostrar al cobrar (informativo);
// NO es lo que se descuenta del saldo del paciente.
export const netAfterCommission = (gross: number) =>
  Math.round(gross * (1 - CARD_COMMISSION) * 100) / 100;

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
