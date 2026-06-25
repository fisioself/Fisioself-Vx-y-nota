// Catálogo de cuestionarios funcionales (PROMs) con cálculo de puntaje e
// interpretación clínica automáticos. Cada escala es data-driven: define sus
// ítems y opciones (con sus puntos) y una función de puntaje que devuelve el
// resultado normalizado más una interpretación. La UI (PromCalculator) solo
// renderiza preguntas y muestra el resultado.

export interface PromOption {
  label: string;
  points: number;
}

export interface PromQuestion {
  text: string;
  group?: string;
  options: PromOption[];
}

export interface PromResult {
  // Texto corto para el campo "Puntuación" (ej. "32/96 · 33%").
  display: string;
  // Interpretación clínica para el campo "Notas".
  interpretation: string;
}

export interface PromScale {
  id: string;
  name: string;
  description: string;
  questions: PromQuestion[];
  // Mínimo de ítems contestados para poder calcular (resto de ítems = null).
  minAnswered?: number;
  score: (answers: (number | null)[]) => PromResult | null;
}

// Likert 0-4 estándar de WOMAC.
const WOMAC_OPTS: PromOption[] = [
  { label: 'Ninguno', points: 0 },
  { label: 'Leve', points: 1 },
  { label: 'Moderado', points: 2 },
  { label: 'Severo', points: 3 },
  { label: 'Extremo', points: 4 }
];

// Opciones 1-5 de QuickDASH (dificultad / severidad).
const qdOpts = (l1: string, l5: string): PromOption[] => [
  { label: `1 · ${l1}`, points: 1 },
  { label: '2', points: 2 },
  { label: '3', points: 3 },
  { label: '4', points: 4 },
  { label: `5 · ${l5}`, points: 5 }
];

const sum = (answers: (number | null)[]): { total: number; answered: number } => {
  let total = 0;
  let answered = 0;
  for (const a of answers) {
    if (a != null) {
      total += a;
      answered += 1;
    }
  }
  return { total, answered };
};

// ── SPPB — Short Physical Performance Battery (geriátrico) ──────────────────
const SPPB: PromScale = {
  id: 'sppb',
  name: 'SPPB (función física global)',
  description: 'Batería de equilibrio, velocidad de marcha y levantarse de la silla. 0–12 puntos.',
  questions: [
    {
      group: 'Equilibrio',
      text: 'Equilibrio (pies juntos, semi-tándem y tándem)',
      options: [
        { label: 'No mantiene posición inicial (0)', points: 0 },
        { label: 'Pies juntos 10s, semi-tándem <10s (1)', points: 1 },
        { label: 'Semi-tándem 10s, tándem <3s (2)', points: 2 },
        { label: 'Tándem 3–9.99s (3)', points: 3 },
        { label: 'Tándem 10s completo (4)', points: 4 }
      ]
    },
    {
      group: 'Velocidad de marcha',
      text: 'Tiempo en caminar 4 metros',
      options: [
        { label: 'No puede (0)', points: 0 },
        { label: '>8.70 s (1)', points: 1 },
        { label: '6.21–8.70 s (2)', points: 2 },
        { label: '4.82–6.20 s (3)', points: 3 },
        { label: '<4.82 s (4)', points: 4 }
      ]
    },
    {
      group: 'Levantarse de la silla',
      text: 'Tiempo en levantarse 5 veces sin usar los brazos',
      options: [
        { label: 'No puede / >60 s (0)', points: 0 },
        { label: '≥16.70 s (1)', points: 1 },
        { label: '13.70–16.69 s (2)', points: 2 },
        { label: '11.20–13.69 s (3)', points: 3 },
        { label: '≤11.19 s (4)', points: 4 }
      ]
    }
  ],
  score: (answers) => {
    const { total, answered } = sum(answers);
    if (answered < 3) return null;
    let interp: string;
    if (total <= 6) interp = 'Desempeño bajo — alto riesgo de discapacidad y caídas.';
    else if (total <= 9) interp = 'Desempeño intermedio — riesgo moderado.';
    else interp = 'Desempeño bueno — bajo riesgo.';
    return { display: `${total}/12`, interpretation: `SPPB ${total}/12. ${interp}` };
  }
};

// ── Oswestry / ODI — discapacidad lumbar ────────────────────────────────────
const odiSection = (group: string, items: string[]): PromQuestion => ({
  group,
  text: group,
  options: items.map((label, i) => ({ label: `${i} · ${label}`, points: i }))
});

const ODI: PromScale = {
  id: 'odi',
  name: 'Oswestry / ODI (columna lumbar)',
  description: '10 secciones, 0–5 cada una. Se reporta como % de discapacidad.',
  questions: [
    odiSection('Intensidad del dolor', [
      'Sin dolor',
      'Muy leve',
      'Moderado',
      'Bastante intenso',
      'Muy intenso',
      'El peor imaginable'
    ]),
    odiSection('Cuidado personal', [
      'Normal sin dolor',
      'Normal con dolor',
      'Doloroso, lento y cuidadoso',
      'Necesito algo de ayuda',
      'Necesito ayuda a diario',
      'No me visto, en cama'
    ]),
    odiSection('Levantar peso', [
      'Pesos sin dolor',
      'Pesos con dolor',
      'No del suelo, sí en mesa',
      'Solo pesos ligeros',
      'Solo muy ligeros',
      'No puedo levantar nada'
    ]),
    odiSection('Caminar', [
      'Sin límite',
      '>1.5 km con dolor',
      '<1 km',
      '<500 m',
      'Solo con bastón',
      'En cama casi siempre'
    ]),
    odiSection('Estar sentado', [
      'Cualquier silla sin límite',
      'Mi silla favorita sin límite',
      '<1 hora',
      '<30 min',
      '<10 min',
      'No puedo sentarme'
    ]),
    odiSection('Estar de pie', [
      'Sin dolor sin límite',
      'Sin límite con dolor',
      '<1 hora',
      '<30 min',
      '<10 min',
      'No puedo estar de pie'
    ]),
    odiSection('Dormir', [
      'Sin alteración',
      'Ocasionalmente alterado',
      '<6 h de sueño',
      '<4 h',
      '<2 h',
      'No duermo por dolor'
    ]),
    odiSection('Vida social', [
      'Normal sin dolor',
      'Normal con dolor',
      'Limita actividades intensas',
      'Salgo poco',
      'Solo en casa',
      'Sin vida social'
    ]),
    odiSection('Viajar', [
      'Sin dolor',
      'Con dolor',
      '>2 h con dolor',
      '<1 h',
      '<30 min',
      'Solo a tratamiento'
    ]),
    odiSection('Cambios en el dolor', [
      'Mejorando rápido',
      'Mejorando lento',
      'Estable',
      'Empeorando lento',
      'Empeorando rápido',
      'Empeorando muy rápido'
    ])
  ],
  minAnswered: 5,
  score: (answers) => {
    const { total, answered } = sum(answers);
    if (answered < 5) return null;
    const pct = Math.round((total / (answered * 5)) * 100);
    let interp: string;
    if (pct <= 20) interp = 'Discapacidad mínima.';
    else if (pct <= 40) interp = 'Discapacidad moderada.';
    else if (pct <= 60) interp = 'Discapacidad severa.';
    else if (pct <= 80) interp = 'Discapacidad incapacitante.';
    else interp = 'Máxima discapacidad / reposo.';
    return {
      display: `${pct}% (${total}/${answered * 5})`,
      interpretation: `ODI ${pct}% — ${interp}`
    };
  }
};

// ── QuickDASH — miembro superior (versión abreviada de DASH, 11 ítems) ───────
const QUICKDASH: PromScale = {
  id: 'quickdash',
  name: 'QuickDASH (miembro superior)',
  description: '11 ítems, 1–5. Se reporta 0–100 (mayor = más discapacidad). Mínimo 10 contestados.',
  questions: [
    { text: 'Abrir un frasco nuevo o apretado', options: qdOpts('Sin dificultad', 'Incapaz') },
    { text: 'Tareas domésticas pesadas', options: qdOpts('Sin dificultad', 'Incapaz') },
    { text: 'Cargar una bolsa del súper o maletín', options: qdOpts('Sin dificultad', 'Incapaz') },
    { text: 'Lavarse la espalda', options: qdOpts('Sin dificultad', 'Incapaz') },
    {
      text: 'Usar un cuchillo para cortar alimentos',
      options: qdOpts('Sin dificultad', 'Incapaz')
    },
    {
      text: 'Actividades recreativas con fuerza o impacto en el brazo',
      options: qdOpts('Sin dificultad', 'Incapaz')
    },
    {
      text: 'Interferencia con actividades sociales (últ. semana)',
      options: qdOpts('Nada', 'Muchísimo')
    },
    {
      text: 'Limitación en trabajo u otras actividades diarias',
      options: qdOpts('Sin limitación', 'Incapaz')
    },
    { text: 'Dolor de brazo, hombro o mano', options: qdOpts('Ninguno', 'Extremo') },
    { text: 'Hormigueo en brazo, hombro o mano', options: qdOpts('Ninguno', 'Extremo') },
    { text: 'Dificultad para dormir por el dolor', options: qdOpts('Ninguna', 'Extrema') }
  ],
  minAnswered: 10,
  score: (answers) => {
    const { total, answered } = sum(answers);
    if (answered < 10) return null;
    const score = Math.round((total / answered - 1) * 25 * 10) / 10;
    let interp: string;
    if (score <= 15) interp = 'Discapacidad mínima.';
    else if (score <= 40) interp = 'Discapacidad leve a moderada.';
    else if (score <= 70) interp = 'Discapacidad moderada a severa.';
    else interp = 'Discapacidad severa.';
    return { display: `${score}/100`, interpretation: `QuickDASH ${score}/100 — ${interp}` };
  }
};

// ── WOMAC — cadera / rodilla (artrosis), 24 ítems ───────────────────────────
const womacQ = (group: string, text: string): PromQuestion => ({
  group,
  text,
  options: WOMAC_OPTS
});

const WOMAC: PromScale = {
  id: 'womac',
  name: 'WOMAC (cadera/rodilla)',
  description: '24 ítems (dolor, rigidez, función), 0–4 cada uno. Total 0–96; mayor = peor.',
  questions: [
    womacQ('Dolor', 'Al caminar en plano'),
    womacQ('Dolor', 'Al subir o bajar escaleras'),
    womacQ('Dolor', 'Por la noche en cama'),
    womacQ('Dolor', 'Al estar sentado o acostado'),
    womacQ('Dolor', 'Al estar de pie'),
    womacQ('Rigidez', 'Rigidez matutina al despertar'),
    womacQ('Rigidez', 'Rigidez durante el resto del día'),
    womacQ('Función', 'Bajar escaleras'),
    womacQ('Función', 'Subir escaleras'),
    womacQ('Función', 'Levantarse de estar sentado'),
    womacQ('Función', 'Estar de pie'),
    womacQ('Función', 'Agacharse al suelo'),
    womacQ('Función', 'Caminar en plano'),
    womacQ('Función', 'Entrar/salir del coche'),
    womacQ('Función', 'Ir de compras'),
    womacQ('Función', 'Ponerse los calcetines'),
    womacQ('Función', 'Levantarse de la cama'),
    womacQ('Función', 'Quitarse los calcetines'),
    womacQ('Función', 'Estar acostado en cama'),
    womacQ('Función', 'Entrar/salir de la regadera o tina'),
    womacQ('Función', 'Estar sentado'),
    womacQ('Función', 'Sentarse/levantarse del inodoro'),
    womacQ('Función', 'Tareas domésticas pesadas'),
    womacQ('Función', 'Tareas domésticas ligeras')
  ],
  minAnswered: 24,
  score: (answers) => {
    const { total, answered } = sum(answers);
    if (answered < 24) return null;
    const pct = Math.round((total / 96) * 100);
    let interp: string;
    if (pct <= 25) interp = 'Afectación leve.';
    else if (pct <= 50) interp = 'Afectación moderada.';
    else if (pct <= 75) interp = 'Afectación importante.';
    else interp = 'Afectación severa.';
    return {
      display: `${total}/96 · ${pct}%`,
      interpretation: `WOMAC ${total}/96 (${pct}%) — ${interp}`
    };
  }
};

export const PROM_SCALES: PromScale[] = [SPPB, ODI, QUICKDASH, WOMAC];

export const getPromScale = (id: string): PromScale | undefined =>
  PROM_SCALES.find((s) => s.id === id);
