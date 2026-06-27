import type { GlobalFinanceSummary } from '../../services/financeApi';
// money y monthYearLabel viven una sola vez en financeUtils; aquí se reusan con
// alias locales (m, monthLabel) para no duplicar el formateo de moneda/mes.
import { money as m, monthYearLabel as monthLabel } from './financeUtils';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const tableRow = (cells: string[]) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;

function buildHtml(s: GlobalFinanceSummary): string {
  const cm = s.currentMonth;
  const caja = s.caja;
  const today = new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date());

  const monthlyRows = [...s.monthly]
    .reverse()
    .map((mo) =>
      tableRow([
        `<span style="text-transform:capitalize">${monthLabel(mo.month)}</span>`,
        `<span style="color:#1f9d57">${m(mo.income)}</span>`,
        `<span style="color:#c0392b">${m(mo.expenses)}</span>`,
        `<strong style="color:${mo.net >= 0 ? '#1f9d57' : '#c0392b'}">${m(mo.net)}</strong>`,
        String(mo.patients),
        String(mo.sessions),
        String(mo.valoraciones)
      ])
    )
    .join('');

  const totals = s.monthly.reduce(
    (a, mo) => ({
      income: a.income + mo.income,
      expenses: a.expenses + mo.expenses,
      net: a.net + mo.net,
      sessions: a.sessions + mo.sessions,
      valoraciones: a.valoraciones + mo.valoraciones
    }),
    { income: 0, expenses: 0, net: 0, sessions: 0, valoraciones: 0 }
  );

  const topRows = s.topPatients
    .map((t, i) => tableRow([`${i + 1}. ${t.fullName}`, `<strong>${m(t.paid)}</strong>`]))
    .join('');

  const expRows = s.expensesByCategory
    .map((c) =>
      tableRow([cap(c.category), `<strong style="color:#c0392b">-${m(c.amount)}</strong>`])
    )
    .join('');

  const cajaRows = Object.entries(caja.byMethod)
    .map(([method, val]) => tableRow([cap(method), `<strong>${m(Number(val))}</strong>`]))
    .join('');

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <title>Reporte financiero Fisioself</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,Arial,sans-serif;color:#1f2933;font-size:13px;padding:28px 32px;max-width:820px;margin:0 auto}
    h1{color:#12372a;font-size:22px;margin-bottom:2px}
    h2{color:#12372a;font-size:15px;margin:20px 0 8px;border-bottom:1px solid #e4e7eb;padding-bottom:4px}
    .subtitle{color:#52606d;font-size:12px;margin-bottom:20px}
    .kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:8px}
    .kpi{border:1px solid #e4e7eb;border-radius:8px;padding:10px 14px}
    .kpi .label{font-size:11px;color:#52606d;margin-bottom:3px}
    .kpi .value{font-size:18px;font-weight:700}
    table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:4px}
    th{background:#f0f4f8;text-align:left;padding:5px 8px;font-size:11px;color:#52606d;font-weight:600;text-transform:uppercase;letter-spacing:.04em}
    td{padding:5px 8px;border-bottom:1px solid #f0f4f8}
    tfoot td{font-weight:700;border-top:2px solid #e4e7eb}
    .footer{margin-top:24px;font-size:11px;color:#9aa5b1;border-top:1px solid #e4e7eb;padding-top:10px}
    @media print{body{padding:0}@page{margin:1.5cm}}
  </style>
</head>
<body>
  <h1>Reporte financiero</h1>
  <p class="subtitle">Fisioself · Generado el ${today}</p>

  <h2>Resumen del mes en curso</h2>
  <div class="kpi-grid">
    <div class="kpi">
      <div class="label">Ingresos</div>
      <div class="value" style="color:#1f9d57">${m(cm.income)}</div>
    </div>
    <div class="kpi">
      <div class="label">Gastos</div>
      <div class="value" style="color:#c0392b">${m(cm.expenses)}</div>
    </div>
    <div class="kpi">
      <div class="label">Ganancia neta</div>
      <div class="value" style="color:${cm.net >= 0 ? '#1f9d57' : '#c0392b'}">${m(cm.net)}</div>
    </div>
    <div class="kpi">
      <div class="label">Pacientes</div>
      <div class="value">${cm.patients}</div>
    </div>
    <div class="kpi">
      <div class="label">Sesiones cobradas</div>
      <div class="value">${cm.sessions}</div>
    </div>
    <div class="kpi">
      <div class="label">Valoraciones</div>
      <div class="value" style="color:#8e44ad">${cm.valoraciones}</div>
    </div>
  </div>

  <h2>Caja acumulada (todo el tiempo)</h2>
  <table>
    <thead><tr><th>Método</th><th>Total</th></tr></thead>
    <tbody>${cajaRows}</tbody>
    <tfoot><tr><td>Total caja</td><td><strong>${m(caja.total)}</strong></td></tr></tfoot>
  </table>

  <h2>Historial mensual</h2>
  <table>
    <thead><tr><th>Mes</th><th>Ingresos</th><th>Gastos</th><th>Neto</th><th>Pacientes</th><th>Sesiones</th><th>Valoraciones</th></tr></thead>
    <tbody>${monthlyRows}</tbody>
    <tfoot><tr>
      <td>Total</td>
      <td style="color:#1f9d57">${m(totals.income)}</td>
      <td style="color:#c0392b">${m(totals.expenses)}</td>
      <td style="color:${totals.net >= 0 ? '#1f9d57' : '#c0392b'};font-weight:700">${m(totals.net)}</td>
      <td>—</td>
      <td>${totals.sessions}</td>
      <td>${totals.valoraciones}</td>
    </tr></tfoot>
  </table>

  ${
    s.topPatients.length > 0
      ? `<h2>Top pacientes por ingreso</h2>
  <table>
    <thead><tr><th>Paciente</th><th>Total pagado</th></tr></thead>
    <tbody>${topRows}</tbody>
  </table>`
      : ''
  }

  ${
    s.expensesByCategory.length > 0
      ? `<h2>Gastos por categoría</h2>
  <table>
    <thead><tr><th>Categoría</th><th>Total</th></tr></thead>
    <tbody>${expRows}</tbody>
  </table>`
      : ''
  }

  <p class="footer">Reporte generado por Fisioself. Solo cifras agregadas, sin datos personales de pacientes.</p>
</body>
</html>`;
}

// Abre el reporte en una ventana nueva y dispara el diálogo de impresión del
// navegador. El usuario puede elegir "Guardar como PDF" desde ahí, sin agregar
// bibliotecas pesadas de generación de PDF.
export function exportFinancePdf(summary: GlobalFinanceSummary): void {
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) {
    alert('El navegador bloqueó la ventana emergente. Permite pop-ups para este sitio.');
    return;
  }
  win.document.write(buildHtml(summary));
  win.document.close();
  win.focus();
  // Pequeño delay para que el navegador termine de renderizar antes de imprimir.
  setTimeout(() => win.print(), 400);
}
