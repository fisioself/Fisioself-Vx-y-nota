const safe = (value) => value || 'No registrado';

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
      `Pronostico: ${safe(item.prognosis)}`
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
