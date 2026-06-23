// Catálogo clínico de valoración por zonas. Cada zona trae sus movimientos (ROM),
// músculos (fuerza Daniels) y pruebas especiales agrupadas por tejido, con las
// opciones de resultado propias de cada prueba y su nota clínica.
//
// PILOTO: por ahora Tobillo/Pie y Rodilla. Las 6 zonas restantes (cadera, lumbar,
// cervical, hombro, codo, mano) se añaden a este mismo arreglo en la fase 2.

export type TestInputKind = 'select' | 'seconds' | 'text';

export interface SpecialTestDef {
  name: string;
  group: string; // subtítulo por tejido/objetivo, ej. "Ligamentos Cruzados"
  // Opciones de resultado. Si se omite, usa DEFAULT_TEST_OPTIONS (Pos/Neg/No valorado).
  options?: string[];
  // Nota clínica de apoyo (las que el fisio escribió en cursiva). Opcional.
  note?: string;
  // Tipo de captura del resultado: selector (default), segundos o texto libre.
  input?: TestInputKind;
}

export interface ZoneCatalog {
  id: string;
  label: string;
  movements: string[]; // nombres de movimiento para ROM
  muscles: string[]; // músculos/grupos para fuerza
  specialTests: SpecialTestDef[];
}

export const DEFAULT_TEST_OPTIONS = ['Positivo', 'Negativo', 'No valorado'] as const;

// Escala de Daniels 0-5 (fuerza muscular manual).
export const DANIELS_OPTIONS = [
  '0 - Sin contracción',
  '1 - Contracción palpable sin movimiento',
  '2 - Movimiento eliminando gravedad',
  '3 - Movimiento contra gravedad',
  '4 - Movimiento contra resistencia moderada',
  '5 - Fuerza normal'
] as const;

export const ROM_RANGE_OPTIONS = ['Limitado', 'Funcional', 'Completo'] as const;

const TOBILLO_PIE: ZoneCatalog = {
  id: 'tobillo_pie',
  label: 'Tobillo y pie',
  movements: [
    'Flexión dorsal',
    'Flexión plantar',
    'Inversión',
    'Eversión',
    'Flexión de dedos',
    'Extensión de dedos'
  ],
  muscles: [
    'Tibial anterior',
    'Tríceps sural (gastrocnemio/sóleo)',
    'Tibial posterior',
    'Peroneos (largo/corto)',
    'Extensor largo del hallux',
    'Flexor largo del hallux',
    'Extensor común de los dedos'
  ],
  specialTests: [
    {
      group: 'Reglas de decisión clínica (descarte de fracturas)',
      name: 'Reglas de Ottawa para tobillo y pie',
      options: ['Cumple criterios (requiere Rx)', 'No cumple (seguro para carga)', 'No valorado']
    },
    {
      group: 'Ligamentos laterales y mediales (esguinces)',
      name: 'Cajón anterior (lig. talofibular anterior)'
    },
    {
      group: 'Ligamentos laterales y mediales (esguinces)',
      name: 'Inclinación astragalina / Talar Tilt (cara lateral)'
    },
    {
      group: 'Ligamentos laterales y mediales (esguinces)',
      name: 'Eversión forzada / Bostezo medial (lig. deltoideo)'
    },
    {
      group: 'Sindesmosis (esguince alto de tobillo)',
      name: 'Compresión / Squeeze Test'
    },
    {
      group: 'Sindesmosis (esguince alto de tobillo)',
      name: 'Rotación externa / Kleiger Test'
    },
    {
      group: 'Sindesmosis (esguince alto de tobillo)',
      name: 'Traslación peronea'
    },
    {
      group: 'Tendón de Aquiles',
      name: 'Thompson (ruptura completa)'
    },
    {
      group: 'Tendón de Aquiles',
      name: 'Royal London Hospital (tendinopatía aquílea)'
    },
    {
      group: 'Tendón de Aquiles',
      name: 'Signo del arco / Arc Sign',
      note: 'Diferenciación tendinopatía vs paratendinitis'
    },
    {
      group: 'Fascia plantar y atrapamiento nervioso',
      name: 'Molinete / Windlass Test (fascitis plantar)'
    },
    {
      group: 'Fascia plantar y atrapamiento nervioso',
      name: 'Signo de Tinel (síndrome del túnel tarsiano)'
    },
    {
      group: 'Antepié',
      name: 'Compresión de Mulder (neuroma de Morton / metatarsalgias)'
    },
    {
      group: 'Alineación biomecánica y estructura',
      name: 'Caída del navicular / Navicular Drop Test',
      options: ['> 10mm (hiperpronación)', 'Normal', 'No valorado']
    },
    {
      group: 'Alineación biomecánica y estructura',
      name: 'Jack / Extensión de hallux (arco longitudinal)'
    },
    {
      group: 'Valoración funcional y propiocepción',
      name: 'Apoyo monopodal (Single Leg Stance)',
      options: ['Logrado', 'Con inestabilidad', 'No logrado']
    },
    {
      group: 'Valoración funcional y propiocepción',
      name: 'Equilibrio en Y (Y-Balance Test)',
      options: ['Simétrico', 'Asimétrico', 'No valorado']
    }
  ]
};

const RODILLA: ZoneCatalog = {
  id: 'rodilla',
  label: 'Rodilla',
  movements: ['Flexión', 'Extensión', 'Rotación interna', 'Rotación externa'],
  muscles: [
    'Cuádriceps',
    'Isquiotibiales',
    'Gastrocnemio',
    'Poplíteo',
    'Aductores',
    'Tensor de la fascia lata'
  ],
  specialTests: [
    {
      group: 'Reglas de decisión clínica (descarte de fracturas)',
      name: 'Reglas de Ottawa para rodilla',
      options: ['Cumple criterios (requiere Rx)', 'No cumple (seguro para carga)', 'No valorado'],
      note: 'Esencial post-traumatismo, antes de pruebas de estrés ligamentario.'
    },
    {
      group: 'Ligamentos cruzados (LCA y LCP)',
      name: 'Lachman (LCA)',
      note: 'Mayor sensibilidad para ruptura aguda.'
    },
    { group: 'Ligamentos cruzados (LCA y LCP)', name: 'Cajón anterior (LCA)' },
    { group: 'Ligamentos cruzados (LCA y LCP)', name: 'Cajón posterior (LCP)' },
    { group: 'Ligamentos cruzados (LCA y LCP)', name: 'Pivot Shift (inestabilidad rotatoria LCA)' },
    { group: 'Ligamentos cruzados (LCA y LCP)', name: 'Signo del hundimiento / Sag Sign (LCP)' },
    {
      group: 'Ligamentos colaterales (LCM y LCL)',
      name: 'Valgo forzado / Bostezo medial (LCM)',
      note: 'Evaluar a 0° y a 30° de flexión.'
    },
    {
      group: 'Ligamentos colaterales (LCM y LCL)',
      name: 'Varo forzado / Bostezo lateral (LCL)',
      note: 'Evaluar a 0° y a 30° de flexión.'
    },
    {
      group: 'Meniscos',
      name: 'Thessaly (Apley en carga)',
      note: 'Alta precisión diagnóstica.'
    },
    { group: 'Meniscos', name: 'McMurray' },
    { group: 'Meniscos', name: 'Apley (compresión y distracción)' },
    {
      group: 'Meniscos',
      name: 'Palpación de la interlínea articular',
      options: ['Doloroso', 'Sin dolor', 'No valorado']
    },
    { group: 'Patelofemoral', name: 'Aprehensión patelar (inestabilidad / luxación)' },
    { group: 'Patelofemoral', name: 'Clarke / Roce patelar (condromalacia)' },
    {
      group: 'Patelofemoral',
      name: 'Inclinación patelar / Patellar Tilt Test',
      note: 'Retracción del retináculo lateral.'
    },
    {
      group: 'Síndromes friccionales y tendinopatías',
      name: 'Compresión de Noble (cintilla iliotibial)'
    },
    {
      group: 'Síndromes friccionales y tendinopatías',
      name: 'Renne (cintilla iliotibial en carga)'
    },
    {
      group: 'Síndromes friccionales y tendinopatías',
      name: 'Palpación del polo inferior de la rótula (tendinopatía patelar)'
    },
    {
      group: 'Valoración funcional y biomecánica',
      name: 'Sentadilla a una pierna / Single Leg Squat',
      options: ['Adecuado', 'Valgo dinámico', 'No logrado']
    },
    {
      group: 'Valoración funcional y biomecánica',
      name: 'Salto / Hop Test',
      options: ['Asimetría <10%', 'Asimetría >10%', 'No valorado']
    }
  ]
};

// Orden en el que aparecen las zonas en el selector.
export const ZONE_CATALOGS: ZoneCatalog[] = [TOBILLO_PIE, RODILLA];

export const getZoneCatalog = (id: string): ZoneCatalog | undefined =>
  ZONE_CATALOGS.find((z) => z.id === id);

// Banderas rojas más relevantes en fisioterapia (checklist). "Otras" va aparte.
export const RED_FLAG_OPTIONS = [
  'Fiebre / escalofríos',
  'Pérdida de peso inexplicable',
  'Dolor nocturno severo que no cede',
  'Dolor en reposo constante',
  'Antecedente de cáncer',
  'Déficit neurológico progresivo',
  'Alteración de esfínteres (vejiga/intestino)',
  'Trauma significativo reciente',
  'Uso prolongado de corticoides',
  'Adormecimiento en silla de montar (zona perineal)'
] as const;

export const SYMPTOM_CLASSIFICATION = ['Agudo', 'Subagudo', 'Crónico'] as const;
export const INJURY_MECHANISM = [
  'Insidioso',
  'Traumático',
  'Movimiento repetitivo',
  'Postural / sobrecarga'
] as const;
export const PAIN_TYPE_OPTIONS = ['Punzante', 'Sordo', 'Urente', 'Irradiado', 'Opresivo'] as const;
