import type { Patient, Evaluation, EvaluationZone } from '../types/clinical';
import { computeAge } from './dateUtils';
import {
  isRomRowAltered,
  isStrengthRowAltered,
  isSpo2Abnormal,
  isHeartRateAbnormal,
  isRespRateAbnormal,
  isBloodPressureAbnormal
} from './clinicalFindings';

export const exportToPdf = (patient: Patient | null): void => {
  if (!patient) return;
  window.print();
};

const v = (value: unknown): string => (value ? String(value) : '—');

// Escapa HTML para insertar texto libre (notas, texto de IA) sin romper el documento.
const esc = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

// Texto multilínea (p. ej. salida de IA con viñetas) → HTML con saltos de línea.
const multiline = (value: unknown): string => esc(value).replace(/\n/g, '<br/>');

// Fecha ISO (YYYY-MM-DD) → DD/MM/AAAA (formato México). Se ancla a mediodía
// para que no se corra un día por zona horaria.
const fmtDateMX = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

// Fila corta etiqueta:valor. Devuelve '' si el valor está vacío → no se imprime.
const row = (label: string, value: unknown): string =>
  value ? `<p class="row"><span class="row-label">${label}</span> ${esc(value)}</p>` : '';

// Bloque destacado para texto largo (diagnóstico, pronóstico, objetivos, plan).
// Conserva los saltos de línea y se ve como una tarjeta. '' si está vacío.
const block = (label: string, value: unknown): string =>
  value
    ? `<div class="block"><div class="block-label">${label}</div><div class="block-body">${multiline(value)}</div></div>`
    : '';

// Silueta SVG con los puntos de dolor de una vista (frontal/posterior).
const bodySvg = (
  points: { view: 'front' | 'back'; x: number; y: number }[],
  view: 'front' | 'back'
): string => {
  const body =
    '<circle cx="50" cy="14" r="10"/><rect x="46" y="23" width="8" height="6" rx="2"/>' +
    '<rect x="33" y="28" width="34" height="58" rx="12"/><rect x="20" y="30" width="11" height="48" rx="5"/>' +
    '<rect x="69" y="30" width="11" height="48" rx="5"/><rect x="36" y="82" width="12" height="84" rx="5"/>' +
    '<rect x="52" y="82" width="12" height="84" rx="5"/>';
  const dots = points
    .filter((p) => p.view === view)
    .map(
      (p) =>
        `<circle cx="${p.x}" cy="${p.y}" r="3.2" fill="rgba(220,38,38,.78)" stroke="#991b1b" stroke-width="0.8"/>`
    )
    .join('');
  return `<svg viewBox="0 0 100 200" width="104" height="208"><g fill="#e2e8f0" stroke="#94a3b8" stroke-width="0.8">${body}</g>${dots}</svg>`;
};

// ¿Una zona tiene algo que mostrar? (si no, se omite por completo del PDF)
const zoneHasContent = (zone: EvaluationZone): boolean => {
  const p = zone.pain;
  const hasPain = !!(
    p &&
    (p.location || p.intensity != null || p.type || p.aggravating_factors || p.easing_factors)
  );
  const roms = (zone.movement_ranges || []).filter((r) => r.movement || r.range || r.degrees);
  const strengths = (zone.muscle_strength || []).filter((r) => r.muscle || r.daniels);
  const tests = (zone.special_tests || []).filter((r) => r.result);
  return hasPain || roms.length > 0 || strengths.length > 0 || tests.length > 0 || !!zone.palpation;
};

function buildZoneHtml(zone: EvaluationZone): string {
  const pain = zone.pain;
  const hasPain = !!(
    pain &&
    (pain.location ||
      pain.intensity != null ||
      pain.type ||
      pain.aggravating_factors ||
      pain.easing_factors)
  );
  const roms = (zone.movement_ranges || []).filter((r) => r.movement || r.range || r.degrees);
  const strengths = (zone.muscle_strength || []).filter((r) => r.muscle || r.daniels);
  const tests = (zone.special_tests || []).filter((r) => r.result);

  const painBits = hasPain
    ? [
        pain?.location ? esc(pain.location) : '',
        pain?.intensity != null ? `EVA ${pain.intensity}/10` : '',
        pain?.type ? esc(pain.type) : '',
        pain?.aggravating_factors ? `agrava: ${esc(pain.aggravating_factors)}` : '',
        pain?.easing_factors ? `alivia: ${esc(pain.easing_factors)}` : ''
      ].filter(Boolean)
    : [];

  return `
  <div class="zone">
    <h3>${esc(zone.zone)}</h3>
    ${painBits.length ? `<p class="zone-pain"><span class="row-label">Dolor</span> ${painBits.join(' · ')}</p>` : ''}
    ${
      roms.length
        ? `<table><thead><tr><th>Movimiento</th><th>Tipo</th><th>Rango</th><th>Afectado</th><th>Sano</th><th>Dolor</th><th>Notas</th></tr></thead><tbody>
      ${roms.map((r) => `<tr class="${isRomRowAltered(r.range, r.pain) ? 'altered' : ''}"><td>${v(r.movement)}</td><td>${v(r.type)}</td><td>${v(r.range)}</td><td>${r.degrees ? `${r.degrees}°` : '—'}</td><td>${r.degrees_healthy ? `${r.degrees_healthy}°` : '—'}</td><td>${r.pain === 'Sí' ? 'Sí' : '—'}</td><td>${v(r.notes)}</td></tr>`).join('')}
    </tbody></table>`
        : ''
    }
    ${
      strengths.length
        ? `<table><thead><tr><th>Músculo</th><th>Daniels</th><th>Dolor</th><th>Notas</th></tr></thead><tbody>
      ${strengths.map((r) => `<tr class="${isStrengthRowAltered(r.daniels, r.pain) ? 'altered' : ''}"><td>${v(r.muscle)}</td><td>${v(r.daniels)}</td><td>${r.pain === 'Sí' ? 'Sí' : '—'}</td><td>${v(r.notes)}</td></tr>`).join('')}
    </tbody></table>`
        : ''
    }
    ${
      tests.length
        ? `<table><thead><tr><th>Prueba</th><th>Resultado</th><th>Notas</th></tr></thead><tbody>
      ${tests.map((t) => `<tr><td>${v(t.name)}</td><td>${v(t.result)}</td><td>${v(t.notes)}</td></tr>`).join('')}
    </tbody></table>`
        : ''
    }
    ${zone.palpation ? `<p class="zone-pain"><span class="row-label">Palpación</span> ${esc(zone.palpation)}</p>` : ''}
  </div>`;
}

function buildEvaluationHtml(evaluation: Evaluation, patientName: string): string {
  const s = evaluation.sections || {};
  const id = (s.patient_identity || {}) as Record<string, string | null | undefined>;
  const c = s.consultation || {};
  const g = s.general_assessment || {};
  const rf = s.red_flags || {};
  const yf = s.yellow_flags || {};
  const fs = s.functional_scales || {};
  const cl = s.conclusion || {};
  const zones = (s.zones || []).filter(zoneHasContent);
  const painPoints = s.pain_map?.points || [];

  const redList = [...(rf.items ?? []), rf.other].filter(Boolean).join('; ');
  const yfList = [...(yf.items ?? []), yf.other].filter(Boolean).join('; ');

  const date = new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date());

  // Cada sección se arma por separado y solo entra si tiene contenido. Así el
  // PDF muestra ÚNICAMENTE lo que se registró, sin secciones ni campos vacíos.
  const sections: { title: string; body: string }[] = [];
  const add = (title: string, body: string) => {
    if (body && body.replace(/\s/g, '')) sections.push({ title, body });
  };

  // 1. Datos generales
  add(
    'Datos generales',
    `<div class="two-col">
      ${row('Nombre', id.full_name || patientName)}
      ${row('Fecha de nacimiento', id.birth_date ? `${fmtDateMX(id.birth_date)}${computeAge(id.birth_date) ? ` (${computeAge(id.birth_date)} años)` : ''}` : '')}
      ${row('Sexo', id.sex)}
      ${row('Ocupación', id.occupation)}
      ${row('Teléfono', id.phone)}
      ${row('Contacto de emergencia', id.emergency_contact)}
      ${row('Referido por', id.referred_by)}
      ${row('Fisioterapeuta', id.therapist_name)}
    </div>`
  );

  // 2. Motivo de consulta
  add(
    'Motivo de consulta e historia',
    `${row('Motivo', c.reason)}
     ${row('Diagnóstico médico', c.medical_diagnosis)}
     ${row('Inicio de síntomas', c.symptom_onset_date ? fmtDateMX(c.symptom_onset_date) : '')}
     ${row('Clasificación', c.symptom_classification)}
     ${row('Mecanismo de lesión', c.injury_mechanism)}
     ${row('Mecanismo del dolor', c.pain_mechanism)}
     ${c.clinical_history ? block('Historia clínica', c.clinical_history) : ''}
     ${redList ? `<p class="flag flag-red">🚩 Banderas rojas: ${esc(redList)}</p>` : ''}
     ${yfList ? `<p class="flag flag-amber">⚠ Banderas amarillas: ${esc(yfList)}</p>` : ''}`
  );

  // 3. Valoración general — los vitales fuera de referencia van marcados en
  // ámbar (mismos umbrales que el formulario/expediente); si la lectura de SpO₂
  // se registró como poco confiable, se anota junto con la causa.
  const mark = (value: string | null | undefined, abnormal: boolean): string =>
    abnormal ? `<span class="vital-warn">⚠ ${v(value)}</span>` : v(value);
  const spo2Note =
    g.spo2_reliable === false
      ? ` <span class="vital-warn">(lectura de baja confiabilidad${g.spo2_quality_note ? `: ${esc(g.spo2_quality_note)}` : ''})</span>`
      : '';
  const vitals =
    g.blood_pressure || g.heart_rate || g.respiratory_rate || g.oxygen_saturation
      ? `<p class="row"><span class="row-label">Signos vitales</span> TA ${mark(g.blood_pressure, isBloodPressureAbnormal(g.blood_pressure))} · FC ${mark(g.heart_rate, isHeartRateAbnormal(g.heart_rate))} · FR ${mark(g.respiratory_rate, isRespRateAbnormal(g.respiratory_rate))} · SatO₂ ${mark(g.oxygen_saturation, isSpo2Abnormal(g.oxygen_saturation))}${spo2Note}</p>`
      : '';
  add(
    'Valoración general',
    `${vitals}
     ${row('Inspección', g.inspection)}
     ${row('Postura', g.posture)}
     ${row('Marcha', g.gait)}`
  );

  // 4. Mapa corporal de dolor
  if (painPoints.length) {
    add(
      'Mapa corporal de dolor',
      `<div class="body-maps">
        <figure><figcaption>Frontal</figcaption>${bodySvg(painPoints, 'front')}</figure>
        <figure><figcaption>Posterior</figcaption>${bodySvg(painPoints, 'back')}</figure>
      </div>`
    );
  }

  // 5. Valoración por zonas
  if (zones.length) {
    add('Valoración por zonas', zones.map(buildZoneHtml).join(''));
  }

  // 6. Cuestionario funcional (PROMs)
  if (fs.name || fs.score) {
    add(
      'Cuestionario funcional (PROMs)',
      `<p class="row">${esc(fs.name)}${fs.score ? ` · <strong>${esc(fs.score)}</strong>` : ''}${fs.notes ? ` — ${esc(fs.notes)}` : ''}</p>`
    );
  }

  // 7. Conclusión y diagnóstico
  const objectivesBlock = cl.objectives
    ? block('Objetivos del tratamiento', cl.objectives)
    : `${block('Objetivos a corto plazo', cl.objectives_short)}${block('Objetivos a mediano plazo', cl.objectives_mid)}${block('Objetivos a largo plazo', cl.objectives_long)}`;
  add(
    'Conclusión y diagnóstico',
    `${block('Diagnóstico fisioterapéutico', cl.diagnosis)}
     ${block('Pronóstico', cl.prognosis)}
     ${objectivesBlock}
     ${block('Plan de intervención', cl.treatment_plan)}`
  );

  const sectionsHtml = sections
    .map(
      (sec, i) =>
        `<section class="section"><h2><span class="num">${i + 1}</span>${sec.title}</h2>${sec.body}</section>`
    )
    .join('');

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <title>Valoración – ${esc(patientName)}</title>
  <style>
    :root{
      --brand:#0f3d2e; --brand-soft:#e8f0ec; --ink:#1e293b; --muted:#64748b;
      --line:#e2e8f0; --bg-soft:#f8fafc;
    }
    *{box-sizing:border-box;margin:0;padding:0}
    body{
      font-family:'Segoe UI',system-ui,-apple-system,Arial,sans-serif;
      color:var(--ink);font-size:13px;line-height:1.55;
      padding:0;max-width:860px;margin:0 auto;-webkit-print-color-adjust:exact;print-color-adjust:exact;
    }

    /* Encabezado */
    .report-head{
      display:flex;justify-content:space-between;align-items:flex-start;gap:24px;
      background:var(--brand);color:#fff;padding:24px 32px;border-radius:0 0 16px 16px;
    }
    .brand{display:flex;align-items:center;gap:12px}
    .brand-mark{
      width:40px;height:40px;border-radius:11px;background:rgba(255,255,255,.16);
      display:flex;align-items:center;justify-content:center;font-weight:800;font-size:20px;
    }
    .brand-name{font-weight:800;font-size:18px;letter-spacing:.01em}
    .brand-sub{font-size:11px;opacity:.8;text-transform:uppercase;letter-spacing:.14em}
    .head-meta{text-align:right;font-size:11.5px;opacity:.92}
    .head-meta .patient-name{font-size:16px;font-weight:700;opacity:1;margin-bottom:2px}
    .head-eva{
      display:inline-block;margin-top:4px;background:rgba(255,255,255,.16);
      padding:2px 10px;border-radius:999px;font-weight:700
    }

    .wrap{padding:8px 32px 32px}

    /* Secciones — se permite que fluyan y se partan entre páginas para no dejar
       huecos grandes en blanco; solo evitamos cortes en lo pequeño (más abajo). */
    .section{margin-top:16px}
    h2{
      font-size:13px;color:var(--brand);text-transform:uppercase;letter-spacing:.05em;
      font-weight:800;display:flex;align-items:center;gap:9px;
      padding-bottom:6px;margin-bottom:9px;border-bottom:2px solid var(--brand-soft);
      page-break-after:avoid;break-after:avoid;
    }
    h2 .num{
      width:20px;height:20px;border-radius:6px;background:var(--brand);color:#fff;
      font-size:11px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;
    }
    h3{font-size:12.5px;font-weight:700;color:var(--brand);margin:0 0 4px;page-break-after:avoid;break-after:avoid}

    .two-col{display:grid;grid-template-columns:1fr 1fr;gap:0 28px}
    p.row{margin:3px 0}
    .row-label{color:var(--muted);font-weight:600}

    /* Bloques de texto largo (diagnóstico, plan, objetivos, pronóstico) */
    .block{
      background:var(--bg-soft);border:1px solid var(--line);border-left:3px solid var(--brand);
      border-radius:10px;padding:11px 14px;margin:8px 0
    }
    .block-label{
      font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;
      color:var(--brand);margin-bottom:5px
    }
    .block-body{font-size:12.5px;line-height:1.6;color:var(--ink)}

    /* Banderas */
    .flag{margin-top:8px;padding:7px 12px;border-radius:8px;font-weight:600;font-size:12px}
    .flag-red{background:#fdecea;color:#b42318;border:1px solid #f6c9c3}
    .flag-amber{background:#fef6e7;color:#b45309;border:1px solid #f5dca3}

    /* Zonas */
    .zone{border:1px solid var(--line);border-radius:10px;padding:11px 14px;margin:9px 0}
    .zone-pain{margin:4px 0;font-size:12px}
    table{width:100%;border-collapse:collapse;font-size:11px;margin:7px 0}
    thead{display:table-header-group}
    tr{page-break-inside:avoid;break-inside:avoid}
    th{background:var(--brand-soft);text-align:left;padding:5px 9px;font-size:9.5px;color:var(--brand);font-weight:700;text-transform:uppercase;letter-spacing:.03em}
    td{padding:5px 9px;border-bottom:1px solid var(--line)}
    tbody tr:nth-child(even){background:var(--bg-soft)}
    /* Hallazgos alterados (ROM limitado, Daniels<5 o con dolor): resaltados para
       que salten a la vista en el informe. Gana al rayado par/impar. */
    tbody tr.altered,
    tbody tr.altered:nth-child(even){background:#fbeccd}
    tbody tr.altered td{font-weight:700;color:#7a5200}
    tbody tr.altered td:first-child{box-shadow:inset 3px 0 0 #d99b30}
    /* Signos vitales fuera de referencia o SpO₂ de baja confiabilidad. */
    .vital-warn{color:#7a5200;font-weight:700}

    /* Mapa corporal */
    .body-maps{display:flex;gap:28px;justify-content:center;padding:6px 0}
    .body-maps figure{text-align:center}
    .body-maps figcaption{font-size:10.5px;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em}

    /* Firmas y pie */
    .signature{display:flex;justify-content:space-around;gap:40px;margin-top:46px;page-break-inside:avoid}
    .sign-line{flex:1;text-align:center;border-top:1px solid var(--ink);padding-top:6px;max-width:260px}
    .sign-line span{display:block;font-weight:700}
    .sign-line small{color:var(--muted);font-size:10px}

    /* Pie propio repetido en cada hoja (sustituye al del navegador). Solo en
       impresión; en pantalla no estorba. */
    .running-foot{display:none}

    /* Margen de página en 0: así el navegador NO imprime su encabezado/pie
       (fecha, título, "about:blank", número de página). Los márgenes del
       contenido los damos nosotros con padding, y la banda superior va a
       sangre (full-bleed) hasta el borde del papel. */
    @media print{
      @page{margin:0}
      body{max-width:none}
      .report-head{border-radius:0}
      .wrap{padding:14px 16mm 20mm}
      .running-foot{
        display:flex;position:fixed;bottom:0;left:0;right:0;height:11mm;
        align-items:center;justify-content:space-between;gap:16px;padding:0 16mm;
        font-size:9px;color:#94a3b8;border-top:1px solid var(--line);background:#fff;
      }
    }
  </style>
</head>
<body>
  <header class="report-head">
    <div class="brand">
      <div class="brand-mark">F</div>
      <div>
        <div class="brand-name">Fisioself</div>
        <div class="brand-sub">Valoración clínica</div>
      </div>
    </div>
    <div class="head-meta">
      <div class="patient-name">${esc(patientName)}</div>
      <div>Valoración: ${fmtDateMX(evaluation.evaluation_date)}</div>
      <div>Impreso: ${date}</div>
      ${evaluation.id ? `<div>Folio: ${esc(String(evaluation.id).slice(0, 8).toUpperCase())}</div>` : ''}
      ${evaluation.eva_initial != null ? `<div class="head-eva">EVA inicial ${evaluation.eva_initial}/10</div>` : ''}
    </div>
  </header>

  <div class="wrap">
    ${sectionsHtml}

    <div class="signature">
      <div class="sign-line">
        <span>${v(id.therapist_name)}</span>
        <small>Fisioterapeuta a cargo</small>
      </div>
      <div class="sign-line">
        <span>${fmtDateMX(evaluation.evaluation_date)}</span>
        <small>Fecha de valoración</small>
      </div>
    </div>

  </div>

  <footer class="running-foot">
    <span>Fisioself · Documento clínico confidencial</span>
    <span>${esc(patientName)}</span>
  </footer>
</body>
</html>`;
}

export function printEvaluation(evaluation: Evaluation, patientName: string): void {
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) {
    alert('El navegador bloqueó la ventana emergente. Permite pop-ups para este sitio.');
    return;
  }
  win.document.write(buildEvaluationHtml(evaluation, patientName));
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

// ---------------------------------------------------------------------------
// "Plan para el paciente": versión CÁLIDA y humana del plan, para entregar al
// paciente (no es el documento clínico). Reusa lo que el fisio ya escribió
// (meta funcional, objetivos, plan de tratamiento, pronóstico) bajo encabezados
// en lenguaje cercano y con estilo editorial. Omite secciones vacías.
// ---------------------------------------------------------------------------

// Limpia marcadores clínicos que no aportan al paciente (p. ej. "(verificar)"
// que la IA añade a las referencias). Cosmético, no altera el sentido.
const humanize = (value: unknown): string =>
  String(value ?? '')
    .replace(/\s*\(verificar\)/gi, '')
    .trim();

// Bloque cálido: encabezado en lenguaje del paciente + texto con saltos de línea.
const warmBlock = (label: string, value: unknown): string => {
  const clean = humanize(value);
  return clean
    ? `<section class="warm-block"><h2>${label}</h2><div class="warm-body">${multiline(clean)}</div></section>`
    : '';
};

export function buildPatientPlanHtml(evaluation: Evaluation, patient: Patient): string {
  const cl = evaluation.sections?.conclusion || {};
  const fullName = patient.full_name || 'paciente';
  const firstName = fullName.trim().split(/\s+/)[0] || fullName;
  const goal = humanize(patient.functional_goal);
  const date = new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date());

  const body = [
    warmBlock('Tus metas', cl.objectives),
    warmBlock('Tu plan de trabajo en casa', cl.treatment_plan),
    warmBlock('Tu camino hacia la recuperación', cl.prognosis)
  ]
    .filter(Boolean)
    .join('');

  const bodyOrFallback =
    body ||
    `<section class="warm-block"><div class="warm-body">Tu fisioterapeuta te compartirá aquí los detalles de tu plan en tu próxima visita.</div></section>`;

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Plan de ${esc(fullName)}</title>
  <style>
    :root{
      --brand:#12372a; --brand-soft:#e8f0ec; --ink:#334155; --muted:#64748b;
      --band:#f4f7f5; --line:#e6ece9;
    }
    *{box-sizing:border-box}
    body{
      margin:0;color:var(--ink);background:#fff;
      font-family:'Nunito','Segoe UI',system-ui,-apple-system,sans-serif;
      font-size:14px;line-height:1.6;
    }
    .plan-head{
      background:var(--brand);color:#fff;padding:34px 40px 30px;
    }
    .plan-brand{font-size:13px;letter-spacing:.14em;text-transform:uppercase;opacity:.85}
    .plan-hi{font-family:Georgia,'Times New Roman',serif;font-size:30px;margin:14px 0 4px;font-weight:600}
    .plan-goal{font-family:Georgia,'Times New Roman',serif;font-size:19px;font-style:italic;opacity:.95;line-height:1.4;max-width:34em}
    .plan-goal .goal-eyebrow{
      display:block;font-family:'Nunito',sans-serif;font-style:normal;font-size:11px;
      letter-spacing:.12em;text-transform:uppercase;opacity:.75;margin-bottom:4px
    }
    .wrap{padding:30px 40px 40px;max-width:720px;margin:0 auto}
    .warm-block{margin:0 0 22px;padding:20px 24px;background:var(--band);border-radius:16px}
    .warm-block h2{
      font-family:Georgia,'Times New Roman',serif;font-size:19px;color:var(--brand);
      margin:0 0 8px;font-weight:600
    }
    .warm-body{font-size:14.5px;line-height:1.7;color:var(--ink)}
    .closing{
      margin-top:8px;padding:22px 24px;border:1px dashed var(--line);border-radius:16px;
      text-align:center;color:var(--muted)
    }
    .closing strong{color:var(--brand);display:block;font-size:15px;margin-bottom:4px}
    .foot{text-align:center;color:var(--muted);font-size:11px;margin-top:26px}
    @media print{
      @page{margin:0}
      .plan-head{padding:30px 24mm 26px}
      .wrap{padding:26px 24mm 30mm}
    }
  </style></head>
  <body>
    <header class="plan-head">
      <div class="plan-brand">Fisioself</div>
      <div class="plan-hi">Hola, ${esc(firstName)} 👋</div>
      ${
        goal
          ? `<div class="plan-goal"><span class="goal-eyebrow">Este es tu plan para</span>${esc(goal)}</div>`
          : `<div class="plan-goal">Este es tu plan de trabajo hacia tu recuperación.</div>`
      }
    </header>
    <div class="wrap">
      ${bodyOrFallback}
      <div class="closing">
        <strong>Estamos contigo en el proceso 💚</strong>
        La rehabilitación tiene picos y valles: avanza a tu ritmo. Si tienes dudas con algún
        ejercicio o cómo te sientes, escríbenos — estamos a un mensaje de distancia.
      </div>
      <div class="foot">Fisioself · Preparado para ti el ${date}</div>
    </div>
  </body></html>`;
}

export function printPatientPlan(evaluation: Evaluation, patient: Patient): void {
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) {
    alert('El navegador bloqueó la ventana emergente. Permite pop-ups para este sitio.');
    return;
  }
  win.document.write(buildPatientPlanHtml(evaluation, patient));
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}
