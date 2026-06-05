import { describe, expect, it } from 'vitest';
import type { MonthlyPoint } from '../../services/financeApi';
import { buildMonthlyCsv, MONTHLY_CSV_HEADER } from './exportMonthly';

const point = (over: Partial<MonthlyPoint>): MonthlyPoint => ({
  month: '2026-01',
  income: 0,
  expenses: 0,
  net: 0,
  patients: 0,
  sessions: 0,
  newPatients: 0,
  valoraciones: 0,
  ...over
});

describe('buildMonthlyCsv', () => {
  it('arranca con la fila de encabezado', () => {
    const csv = buildMonthlyCsv([]);
    expect(csv).toBe(MONTHLY_CSV_HEADER.join(','));
  });

  it('emite los importes como número plano (sin símbolo) para que Excel sume', () => {
    const csv = buildMonthlyCsv([
      point({ month: '2026-05', income: 12000, expenses: 3000, net: 9000, patients: 8, sessions: 20, valoraciones: 3 })
    ]);
    const [, dataRow] = csv.split('\n');
    const cols = dataRow.split(',');
    // Mes, Ingresos, Gastos, Neto, Pacientes, Sesiones, Valoraciones
    expect(cols.slice(1)).toEqual(['12000', '3000', '9000', '8', '20', '3']);
    expect(dataRow).not.toMatch(/\$/);
  });

  it('respeta el orden cronológico recibido (una fila por mes)', () => {
    const csv = buildMonthlyCsv([point({ month: '2026-04' }), point({ month: '2026-05' })]);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(3); // encabezado + 2 meses
    expect(lines[1]).toMatch(/abril/i);
    expect(lines[2]).toMatch(/mayo/i);
  });

  it('escapa el campo del mes si llegara a contener una coma', () => {
    // month inválido cae al fallback (el propio string), que aquí trae coma.
    const csv = buildMonthlyCsv([point({ month: 'mayo, 2026' })]);
    expect(csv).toContain('"mayo, 2026"');
  });
});
