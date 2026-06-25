import type { Patient, Evaluation, EvaluationZone } from '../types/clinical';

export const exportToPdf = (patient: Patient | null): void => {
  if (!patient) return;
  window.print();
};

const v = (value: unknown): string => (value ? String(value) : '—');

// Fecha ISO (YYYY-MM-DD) → DD/MM/AAAA (formato México). Se ancla a mediodía
// para que no se corra un día por zona horaria.
const fmtDateMX = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const row = (label: string, value: unknown) =>
  value ? `<p><strong>${label}:</strong> ${v(value)}</p>` : '';

function buildZoneHtml(zone: EvaluationZone): string {
  const pain = zone.pain;
  const roms = (zone.movement_ranges || []).filter((r) => r.movement || r.range);
  const strengths = (zone.muscle_strength || []).filter((r) => r.muscle);
  const tests = (zone.special_tests || []).filter((r) => r.result);

  return `
  <div class="zone">
    <h3>${v(zone.zone)}</h3>
    ${pain ? `<p>Dolor: ${v(pain.location)}${pain.intensity != null ? ` · EVA ${pain.intensity}/10` : ''}${pain.type ? ` · ${pain.type}` : ''}</p>` : ''}
    ${
      roms.length
        ? `<table><thead><tr><th>Movimiento</th><th>Tipo</th><th>Rango</th><th>Grados</th><th>Dolor</th><th>Notas</th></tr></thead><tbody>
      ${roms.map((r) => `<tr><td>${v(r.movement)}</td><td>${v(r.type)}</td><td>${v(r.range)}</td><td>${v(r.degrees)}</td><td>${v(r.pain)}</td><td>${v(r.notes)}</td></tr>`).join('')}
    </tbody></table>`
        : ''
    }
    ${
      strengths.length
        ? `<table><thead><tr><th>Músculo</th><th>Daniels</th><th>Dolor</th><th>Notas</th></tr></thead><tbody>
      ${strengths.map((r) => `<tr><td>${v(r.muscle)}</td><td>${v(r.daniels)}</td><td>${v(r.pain)}</td><td>${v(r.notes)}</td></tr>`).join('')}
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
    ${zone.palpation ? `<p>Palpación: ${zone.palpation}</p>` : ''}
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
  const zones = s.zones || [];

  const redList = [...(rf.items ?? []), rf.other].filter(Boolean).join('; ');
  const yfList = [...(yf.items ?? []), yf.other].filter(Boolean).join('; ');

  const date = new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date());

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <title>Valoración – ${patientName}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,Arial,sans-serif;color:#1f2933;font-size:13px;padding:28px 36px;max-width:840px;margin:0 auto}
    h1{font-size:20px;margin-bottom:2px}
    h2{font-size:14px;margin:18px 0 6px;border-bottom:2px solid #12372a;padding-bottom:3px;color:#12372a;text-transform:uppercase;letter-spacing:.04em}
    h3{font-size:13px;font-weight:700;margin:10px 0 4px;color:#12372a}
    .subtitle{color:#52606d;font-size:12px;margin-bottom:18px}
    p{margin:2px 0;line-height:1.5}
    .two-col{display:grid;grid-template-columns:1fr 1fr;gap:0 24px}
    .red{color:#c0392b;font-weight:700}
    .amber{color:#b45309;font-weight:700}
    .zone{border:1px solid #e4e7eb;border-radius:6px;padding:10px 14px;margin:8px 0}
    table{width:100%;border-collapse:collapse;font-size:11px;margin:6px 0}
    th{background:#f0f4f8;text-align:left;padding:4px 8px;font-size:10px;color:#52606d;font-weight:600;text-transform:uppercase}
    td{padding:4px 8px;border-bottom:1px solid #f0f4f8}
    .footer{margin-top:24px;font-size:10px;color:#9aa5b1;border-top:1px solid #e4e7eb;padding-top:8px}
    @media print{body{padding:0}@page{margin:1.5cm}}
  </style>
</head>
<body>
  <h1>Valoración clínica inicial</h1>
  <p class="subtitle">
    ${patientName}
    · Fecha de valoración: ${fmtDateMX(evaluation.evaluation_date)}
    ${evaluation.eva_initial != null ? ` · EVA inicial: ${evaluation.eva_initial}/10` : ''}
    · Impreso el ${date}
  </p>

  <h2>1. Datos generales</h2>
  <div class="two-col">
    ${row('Nombre', id.full_name || patientName)}
    ${row('Fecha de nacimiento', fmtDateMX(id.birth_date))}
    ${row('Sexo', id.sex)}
    ${row('Ocupación', id.occupation)}
    ${row('Teléfono', id.phone)}
    ${row('Contacto de emergencia', id.emergency_contact)}
    ${row('Referido por', id.referred_by)}
    ${row('Fisioterapeuta', id.therapist_name)}
  </div>

  <h2>2. Motivo de consulta</h2>
  ${row('Motivo', c.reason)}
  ${row('Diagnóstico médico', c.medical_diagnosis)}
  ${row('Inicio de síntomas', fmtDateMX(c.symptom_onset_date))}
  ${row('Clasificación', c.symptom_classification)}
  ${row('Mecanismo de lesión', c.injury_mechanism)}
  ${c.clinical_history ? `<p><strong>Historia clínica:</strong><br/>${c.clinical_history}</p>` : ''}

  ${redList ? `<p class="red" style="margin-top:8px">🚩 Banderas rojas: ${redList}</p>` : ''}
  ${yfList ? `<p class="amber" style="margin-top:4px">⚠ Banderas amarillas: ${yfList}</p>` : ''}

  ${
    g.blood_pressure || g.heart_rate || g.inspection || g.posture || g.gait
      ? `<h2>3. Valoración general</h2>
    ${
      g.blood_pressure || g.heart_rate || g.respiratory_rate || g.oxygen_saturation
        ? `<p>Signos vitales: TA ${v(g.blood_pressure)} · FC ${v(g.heart_rate)} · FR ${v(g.respiratory_rate)} · SatO₂ ${v(g.oxygen_saturation)}</p>`
        : ''
    }
    ${row('Inspección', g.inspection)}
    ${row('Postura', g.posture)}
    ${row('Marcha', g.gait)}`
      : ''
  }

  ${
    zones.length
      ? `<h2>4. Valoración por zonas</h2>
    ${zones.map(buildZoneHtml).join('')}`
      : ''
  }

  ${
    fs.name || fs.score
      ? `<h2>5. Cuestionario funcional (PROMs)</h2>
    <p>${v(fs.name)}${fs.score ? ` · ${fs.score}` : ''}${fs.notes ? ` — ${fs.notes}` : ''}</p>`
      : ''
  }

  ${
    cl.diagnosis || cl.objectives_short || cl.treatment_plan
      ? `<h2>6. Conclusión y diagnóstico</h2>
    ${row('Dx fisioterapéutico', cl.diagnosis)}
    ${row('Objetivos corto plazo', cl.objectives_short)}
    ${row('Objetivos mediano plazo', cl.objectives_mid)}
    ${row('Objetivos largo plazo', cl.objectives_long)}
    ${row('Plan de intervención', cl.treatment_plan)}`
      : ''
  }

  <p class="footer">Valoración generada por Fisioself — documento clínico confidencial.</p>
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
