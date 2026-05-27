const safe = (value) => value || 'No registrado';
const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const formatRows = (title, rows = [], valueKey) => [
  title,
  ...(rows.length
    ? rows.map(
        (row) =>
          `- ${safe(row.joint || row.name)}: ${safe(row[valueKey])}${row.notes ? ` | ${row.notes}` : ''}`
      )
    : ['- No registrado'])
];

const formatEvaluationSections = (sections = {}) => {
  const identity = sections.patient_identity || {};
  const history = sections.history || {};
  const consultation = sections.consultation || {};
  const pain = sections.pain || {};
  const exam = sections.physical_exam || {};

  return [
    `Edad: ${safe(identity.age)}`,
    `Sexo: ${safe(identity.sex)}`,
    `Ocupacion: ${safe(identity.occupation)}`,
    `Fisioterapeuta: ${safe(identity.therapist_name)}`,
    `Antecedentes personales: ${safe(history.personal_history)}`,
    `Antecedentes quirurgicos: ${safe(history.surgical_history)}`,
    `Medicamentos actuales: ${safe(history.current_medications)}`,
    `Alergias conocidas: ${safe(history.known_allergies)}`,
    `Uso de anticoagulantes: ${safe(history.anticoagulants)}`,
    `Actividad fisica: ${safe(history.physical_activity)}`,
    `Diagnostico medico: ${safe(consultation.medical_diagnosis)}`,
    `Motivo de consulta: ${safe(consultation.reason)}`,
    `Historia clinica: ${safe(consultation.clinical_history)}`,
    `Dolor localizacion: ${safe(pain.location)}`,
    `Dolor tipo: ${safe(pain.type)}`,
    `Dolor intensidad: ${pain.intensity ?? 'No registrada'}/10`,
    `Factores agravantes: ${safe(pain.aggravating_factors)}`,
    `Factores que alivian: ${safe(pain.easing_factors)}`,
    `Exploracion fisica: ${safe(exam.examination)}`,
    `Inspeccion general: ${safe(exam.general_inspection)}`,
    ...formatRows('Rangos de movimiento:', exam.movement_ranges, 'range'),
    ...formatRows('Fuerza muscular:', exam.muscle_strength, 'strength'),
    ...formatRows('Pruebas especiales:', exam.special_tests, 'result')
  ];
};

const latestEvaluation = (evaluations = []) =>
  [...evaluations].sort((a, b) => new Date(b.evaluation_date) - new Date(a.evaluation_date))[0];

const evaluationMedicalDiagnosis = (evaluation) =>
  evaluation?.sections?.consultation?.medical_diagnosis || evaluation?.medical_diagnosis || '';

export const buildClinicalRecordText = (record) => {
  const notes = record?.session_notes || [];
  const evaluations = record?.evaluations || [];
  const aiConsults = record?.ai_consults || [];
  const latest = latestEvaluation(evaluations);

  return [
    'FISIOSELF - Expediente clinico',
    '',
    `Paciente: ${safe(record?.full_name)}`,
    `Telefono: ${safe(record?.phone)}`,
    `Estado: ${safe(record?.status)}`,
    `Diagnostico medico: ${safe(evaluationMedicalDiagnosis(latest))}`,
    `Diagnostico fisioterapeutico: ${safe(latest?.prognosis)}`,
    '',
    'VALORACIONES',
    ...evaluations.flatMap((item) => [
      '',
      `Fecha: ${safe(item.evaluation_date)}`,
      `EVA inicial: ${item.eva_initial ?? 'No registrada'}`,
      `Banderas rojas: ${safe(item.red_flags)}`,
      `Diagnostico fisioterapeutico: ${safe(item.prognosis)}`,
      ...formatEvaluationSections(item.sections)
    ]),
    '',
    'NOTAS DE SESION',
    ...notes.flatMap((item) => [
      '',
      `Sesion #${item.session_number} - ${safe(item.session_date)}`,
      `EVA: ${item.eva ?? 'No registrada'}`,
      item.raw_text || ''
    ]),
    '',
    'CONSULTAS IA TRAZABLES',
    ...aiConsults.flatMap((item) => [
      '',
      `Tipo: ${safe(item.type)} - ${safe(item.created_at)}`,
      `Validada: ${item.validated ? 'si' : 'no'}`,
      `Notas de validacion: ${safe(item.validation_notes)}`,
      item.output_text || ''
    ])
  ].join('\n');
};

export const downloadTextFile = ({ filename, text }) => {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const paragraph = (label, value) =>
  `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(safe(value))}</p>`;

const noteHtml = (item) => `
  <article class="entry">
    <h3>Sesion #${escapeHtml(item.session_number)} · ${escapeHtml(safe(item.session_date))}</h3>
    ${paragraph('EVA', item.eva ?? 'No registrada')}
    <pre>${escapeHtml(item.raw_text || '')}</pre>
  </article>
`;

const evaluationHtml = (item) => `
  <article class="entry">
    <h3>Valoracion · ${escapeHtml(safe(item.evaluation_date))}</h3>
    ${paragraph('EVA inicial', item.eva_initial ?? 'No registrada')}
    ${paragraph('Diagnostico medico', evaluationMedicalDiagnosis(item))}
    ${paragraph('Diagnostico fisioterapeutico', item.prognosis)}
    ${paragraph('Banderas rojas', item.red_flags)}
  </article>
`;

export const buildClinicalRecordHtml = (record) => {
  const notes = record?.session_notes || [];
  const evaluations = record?.evaluations || [];
  const aiConsults = record?.ai_consults || [];
  const latest = latestEvaluation(evaluations);

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Expediente clinico FISIOSELF</title>
    <style>
      @page { margin: 18mm; }
      * { box-sizing: border-box; }
      body { font-family: Arial, sans-serif; color: #12372a; line-height: 1.45; margin: 0; }
      header { border-bottom: 3px solid #1f5d45; padding-bottom: 18px; margin-bottom: 22px; }
      h1 { font-family: Georgia, serif; font-size: 30px; margin: 0 0 6px; }
      h2 { font-size: 17px; margin: 28px 0 10px; color: #1f5d45; text-transform: uppercase; letter-spacing: 0.08em; }
      h3 { margin: 0 0 8px; font-size: 16px; }
      p { margin: 5px 0; }
      .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 18px; }
      .entry { border: 1px solid rgba(18, 55, 42, 0.18); border-radius: 10px; padding: 12px; margin: 10px 0; break-inside: avoid; }
      pre { white-space: pre-wrap; font-family: Arial, sans-serif; margin: 8px 0 0; }
      .footer { margin-top: 28px; font-size: 12px; color: rgba(18, 55, 42, 0.66); }
    </style>
  </head>
  <body>
    <header>
      <h1>FISIOSELF</h1>
      <p>Expediente clinico · ${escapeHtml(new Date().toLocaleDateString())}</p>
    </header>
    <section class="meta">
      ${paragraph('Paciente', record?.full_name)}
      ${paragraph('Telefono', record?.phone)}
      ${paragraph('Estado', record?.status)}
      ${paragraph('Diagnostico medico', evaluationMedicalDiagnosis(latest))}
      ${paragraph('Diagnostico fisioterapeutico', latest?.prognosis)}
    </section>
    <h2>Valoraciones</h2>
    ${evaluations.length ? evaluations.map(evaluationHtml).join('') : '<p>No hay valoraciones registradas.</p>'}
    <h2>Notas de sesion</h2>
    ${notes.length ? notes.map(noteHtml).join('') : '<p>No hay notas de sesion registradas.</p>'}
    <h2>Consultas IA trazables</h2>
    ${
      aiConsults.length
        ? aiConsults
            .map(
              (item) => `
                <article class="entry">
                  <h3>${escapeHtml(item.type)} · ${escapeHtml(safe(item.created_at))}</h3>
                  ${paragraph('Validada', item.validated ? 'si' : 'no')}
                  <pre>${escapeHtml(item.output_text || '')}</pre>
                </article>
              `
            )
            .join('')
        : '<p>No hay consultas IA registradas.</p>'
    }
    <p class="footer">Documento generado desde FISIOSELF App VX. Revisar antes de compartir fuera de la clinica.</p>
  </body>
</html>`;
};

export const printClinicalRecord = (record) => {
  const win = window.open('', '_blank', 'noopener,noreferrer');
  if (!win) throw new Error('No se pudo abrir ventana de impresion.');
  win.document.write(buildClinicalRecordHtml(record));
  win.document.close();
  win.focus();
  win.print();
};
