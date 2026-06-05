import { useMemo } from 'react';
import type { MonthlyPoint } from '../../services/financeApi';
import { money, monthYearLabel, today } from './financeUtils';
import { buildMonthlyCsv, downloadCsv } from './exportMonthly';

interface MonthlyHistoryProps {
  monthly: MonthlyPoint[];
}

// Historial financiero mes con mes en formato de tabla, con descarga a CSV para
// archivar o compartir. Complementa las gráficas: aquí se ven los números exactos.
export function MonthlyHistory({ monthly }: MonthlyHistoryProps) {
  // Más reciente arriba para lectura; el CSV se exporta en orden cronológico.
  const rows = useMemo(() => [...monthly].reverse(), [monthly]);

  const totals = useMemo(
    () =>
      monthly.reduce(
        (acc, m) => ({
          income: acc.income + m.income,
          expenses: acc.expenses + m.expenses,
          net: acc.net + m.net,
          sessions: acc.sessions + m.sessions,
          valoraciones: acc.valoraciones + m.valoraciones
        }),
        { income: 0, expenses: 0, net: 0, sessions: 0, valoraciones: 0 }
      ),
    [monthly]
  );

  const handleDownload = () => {
    downloadCsv(`finanzas-historial-${today()}.csv`, buildMonthlyCsv([...monthly]));
  };

  return (
    <section className="card">
      <div className="form-header">
        <div>
          <p className="eyebrow">Historial mensual</p>
          <h2>Reporte mes con mes</h2>
        </div>
        <button type="button" onClick={handleDownload} disabled={rows.length === 0}>
          Descargar CSV
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="muted" style={{ marginTop: 12 }}>
          Aún no hay movimientos registrados.
        </p>
      ) : (
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table className="monthly-history-table">
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: 'left' }}>
                  Mes
                </th>
                <th scope="col">Ingresos</th>
                <th scope="col">Gastos</th>
                <th scope="col">Neto</th>
                <th scope="col">Pacientes</th>
                <th scope="col">Sesiones</th>
                <th scope="col">Valoraciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.month}>
                  <th scope="row" style={{ textAlign: 'left', textTransform: 'capitalize' }}>
                    {monthYearLabel(m.month)}
                  </th>
                  <td style={{ color: '#1f9d57' }}>{money(m.income)}</td>
                  <td style={{ color: '#c0392b' }}>{money(m.expenses)}</td>
                  <td style={{ color: m.net >= 0 ? '#1f9d57' : '#c0392b', fontWeight: 600 }}>
                    {money(m.net)}
                  </td>
                  <td>{m.patients}</td>
                  <td>{m.sessions}</td>
                  <td style={{ color: '#8e44ad' }}>{m.valoraciones}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" style={{ textAlign: 'left' }}>
                  Total
                </th>
                <td style={{ color: '#1f9d57' }}>{money(totals.income)}</td>
                <td style={{ color: '#c0392b' }}>{money(totals.expenses)}</td>
                <td style={{ color: totals.net >= 0 ? '#1f9d57' : '#c0392b', fontWeight: 700 }}>
                  {money(totals.net)}
                </td>
                <td aria-hidden="true">—</td>
                <td>{totals.sessions}</td>
                <td style={{ color: '#8e44ad' }}>{totals.valoraciones}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
