const safe = (value) => value || 'No registrado';

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

export const buildClinicalRecordText = (record) => {
  const notes = record?.session_notes || [];
  const evaluations = record?.evaluations || [];
  const aiConsults = record?.ai_consults || [];

  return [
    'FISIOSELF - Expediente clinico',
    '',
    `Paciente: ${safe(record?.full_name)}`,
    `Telefono: ${safe(record?.phone)}`,
    `Correo: ${safe(record?.email)}`,
    `Estado: ${safe(record?.status)}`,
    `Diagnostico medico: ${safe(record?.medical_diagnosis)}`,
    `Diagnostico funcional: ${safe(record?.functional_diagnosis)}`,
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

export const printClinicalRecord = (record) => {
  const text = buildClinicalRecordText(record);
  const win = window.open('', '_blank', 'noopener,noreferrer');
  if (!win) throw new Error('No se pudo abrir ventana de impresion.');
  win.document.write(
    `<!doctype html><html><head><title>Expediente clinico</title><style>body{font-family:Arial,sans-serif;line-height:1.5;padding:32px;white-space:pre-wrap;color:#12372a}</style></head><body>${text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</body></html>`
  );
  win.document.close();
  win.focus();
  win.print();
};
