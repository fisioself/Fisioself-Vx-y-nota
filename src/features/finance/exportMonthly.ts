import type { MonthlyPoint } from '../../services/financeApi';
import { monthYearLabel } from './financeUtils';

export const MONTHLY_CSV_HEADER = [
  'Mes',
  'Ingresos',
  'Gastos',
  'Ganancia neta',
  'Pacientes atendidos',
  'Sesiones cobradas',
  'Valoraciones'
] as const;

// Escapa un campo CSV: si contiene coma, comilla o salto de línea, lo envuelve
// en comillas dobles y duplica las comillas internas (RFC 4180).
const csvField = (value: string | number): string => {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Genera el CSV del historial mensual. Los importes van como número plano (sin
// símbolo de moneda) para que Excel pueda sumarlos. Orden cronológico ascendente.
export function buildMonthlyCsv(rows: MonthlyPoint[]): string {
  const body = rows.map((m) => [
    monthYearLabel(m.month),
    m.income,
    m.expenses,
    m.net,
    m.patients,
    m.sessions,
    m.valoraciones
  ]);
  return [MONTHLY_CSV_HEADER, ...body]
    .map((cols) => cols.map(csvField).join(','))
    .join('\n');
}

// Dispara la descarga de un archivo CSV en el navegador. Antepone el BOM UTF-8
// para que Excel muestre bien los acentos.
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
