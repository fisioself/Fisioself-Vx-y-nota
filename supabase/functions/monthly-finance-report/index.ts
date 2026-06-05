// Monthly finance report → email (Resend)
//
// Llamada por pg_cron (vía net.http_post) el día 1 de cada mes. Calcula el
// resumen financiero del MES ANTERIOR (solo agregados: ingresos, gastos, neto,
// sesiones, pacientes, valoraciones) — SIN ningún dato personal del paciente —
// y lo envía por correo con Resend.
//
// Autenticación: header `x-report-secret` validado contra integration_config
// (mismo patrón que send-push). No expone CORS: es server-to-server.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
// Free tier de Resend: sin dominio verificado solo se puede enviar DESDE
// onboarding@resend.dev y HACIA el correo de la cuenta.
const RESEND_FROM = Deno.env.get('RESEND_FROM') ?? 'Fisioself <onboarding@resend.dev>';
const REPORT_RECIPIENT = Deno.env.get('REPORT_RECIPIENT') ?? 'fisioselff@gmail.com';

interface ReportData {
  month: string;
  income: number;
  expenses: number;
  sessions: number;
  patients: number;
  valoraciones: number;
  income_by_method: Record<string, number>;
  expenses_by_category: Record<string, number>;
}

const money = (n: number) =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(Number.isFinite(n) ? n : 0);

const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  return new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(
    new Date(y, m - 1, 1)
  );
};

function buildHtml(d: ReportData): string {
  const net = Number(d.income) - Number(d.expenses);
  const netColor = net >= 0 ? '#1f9d57' : '#c0392b';
  const rows = (obj: Record<string, number>) =>
    Object.entries(obj)
      .map(
        ([k, v]) =>
          `<tr><td style="padding:4px 8px;text-transform:capitalize">${k}</td>` +
          `<td style="padding:4px 8px;text-align:right">${money(Number(v))}</td></tr>`
      )
      .join('') || '<tr><td style="padding:4px 8px;color:#888">Sin registros</td><td></td></tr>';

  return `<!doctype html><html><body style="font-family:system-ui,Arial,sans-serif;color:#1f2933;max-width:560px;margin:0 auto;padding:16px">
    <h1 style="color:#12372a;font-size:22px;margin:0 0 4px">Reporte financiero</h1>
    <p style="color:#52606d;margin:0 0 20px;text-transform:capitalize">${monthLabel(d.month)}</p>

    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr><td style="padding:8px;background:#f0fff5;border-radius:8px">
        <div style="font-size:12px;color:#52606d">Ingresos</div>
        <div style="font-size:20px;font-weight:700;color:#1f9d57">${money(Number(d.income))}</div>
      </td></tr>
      <tr><td style="padding:8px">
        <div style="font-size:12px;color:#52606d">Gastos</div>
        <div style="font-size:20px;font-weight:700;color:#c0392b">${money(Number(d.expenses))}</div>
      </td></tr>
      <tr><td style="padding:8px;background:#f7f9fb;border-radius:8px">
        <div style="font-size:12px;color:#52606d">Ganancia neta</div>
        <div style="font-size:24px;font-weight:800;color:${netColor}">${money(net)}</div>
      </td></tr>
    </table>

    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:14px">
      <tr><td style="padding:4px 8px">Pacientes atendidos</td><td style="padding:4px 8px;text-align:right;font-weight:600">${d.patients}</td></tr>
      <tr><td style="padding:4px 8px">Sesiones</td><td style="padding:4px 8px;text-align:right;font-weight:600">${d.sessions}</td></tr>
      <tr><td style="padding:4px 8px">Valoraciones</td><td style="padding:4px 8px;text-align:right;font-weight:600">${d.valoraciones}</td></tr>
    </table>

    <h3 style="font-size:14px;color:#12372a;margin:0 0 4px">Ingresos por método</h3>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:14px">${rows(d.income_by_method)}</table>

    <h3 style="font-size:14px;color:#12372a;margin:0 0 4px">Gastos por categoría</h3>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:14px">${rows(d.expenses_by_category)}</table>

    <p style="font-size:12px;color:#9aa5b1;border-top:1px solid #e4e7eb;padding-top:12px">
      Reporte automático de Fisioself. Contiene solo cifras agregadas, sin datos personales de pacientes.
    </p>
  </body></html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Auth: secreto compartido contra integration_config (server-to-server).
  const secretHeader = req.headers.get('x-report-secret');
  if (!secretHeader) {
    return new Response(JSON.stringify({ error: 'Missing x-report-secret' }), { status: 401 });
  }
  const { data: configRow } = await supabase
    .from('integration_config')
    .select('value')
    .eq('key', 'monthly_report_secret')
    .single();
  if (!configRow || configRow.value !== secretHeader) {
    return new Response(JSON.stringify({ error: 'Invalid secret' }), { status: 401 });
  }

  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), { status: 503 });
  }

  // Permite forzar otro mes con { month_offset } (default 1 = mes anterior).
  let monthOffset = 1;
  try {
    const body = await req.json();
    if (typeof body?.month_offset === 'number') monthOffset = body.month_offset;
  } catch {
    // sin body: usamos el default
  }

  const { data, error } = await supabase.rpc('monthly_finance_report', {
    p_month_offset: monthOffset
  });
  if (error || !data) {
    return new Response(JSON.stringify({ error: error?.message ?? 'no_data' }), { status: 500 });
  }

  const report = data as ReportData;
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [REPORT_RECIPIENT],
      subject: `Reporte financiero — ${monthLabel(report.month)}`,
      html: buildHtml(report)
    })
  });

  if (!resp.ok) {
    const detail = await resp.text();
    return new Response(JSON.stringify({ error: 'resend_failed', detail }), { status: 502 });
  }

  return new Response(JSON.stringify({ ok: true, month: report.month }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
});
