import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MonthlyPoint } from '../../services/financeApi';
import { MonthlyHistory } from './MonthlyHistory';
import * as exportMonthly from './exportMonthly';

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

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('MonthlyHistory', () => {
  it('muestra un aviso y deshabilita la descarga cuando no hay datos', () => {
    render(<MonthlyHistory monthly={[]} />);
    expect(screen.getByText(/aún no hay movimientos/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /descargar csv/i })).toBeDisabled();
  });

  it('lista los meses con el más reciente arriba', () => {
    render(
      <MonthlyHistory
        monthly={[point({ month: '2026-04' }), point({ month: '2026-05' })]}
      />
    );
    const rowHeaders = screen.getAllByRole('rowheader');
    // El primero del cuerpo debe ser mayo (más reciente); el último es el Total.
    expect(rowHeaders[0]).toHaveTextContent(/mayo.*2026/i);
    expect(rowHeaders[1]).toHaveTextContent(/abril.*2026/i);
  });

  it('calcula la fila de totales (ingresos, gastos, neto, sesiones, valoraciones)', () => {
    render(
      <MonthlyHistory
        monthly={[
          point({ month: '2026-04', income: 10000, expenses: 2000, net: 8000, sessions: 12, valoraciones: 2 }),
          point({ month: '2026-05', income: 5000, expenses: 1000, net: 4000, sessions: 8, valoraciones: 1 })
        ]}
      />
    );
    const totalRow = screen.getByText('Total').closest('tr') as HTMLElement;
    const cells = within(totalRow);
    expect(cells.getByText('$15,000')).toBeInTheDocument(); // ingresos
    expect(cells.getByText('$3,000')).toBeInTheDocument(); // gastos
    expect(cells.getByText('$12,000')).toBeInTheDocument(); // neto
    expect(cells.getByText('20')).toBeInTheDocument(); // sesiones
    expect(cells.getByText('3')).toBeInTheDocument(); // valoraciones
  });

  it('al pulsar "Descargar CSV" dispara la descarga en orden cronológico', async () => {
    const spy = vi.spyOn(exportMonthly, 'downloadCsv').mockImplementation(() => {});
    render(
      <MonthlyHistory
        monthly={[point({ month: '2026-04' }), point({ month: '2026-05' })]}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /descargar csv/i }));
    expect(spy).toHaveBeenCalledTimes(1);
    const [filename, csv] = spy.mock.calls[0];
    expect(filename).toMatch(/^finanzas-historial-.*\.csv$/);
    // Cronológico ascendente en el archivo: abril antes que mayo.
    expect(csv.indexOf('abril')).toBeLessThan(csv.indexOf('mayo'));
  });
});
