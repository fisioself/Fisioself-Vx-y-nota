// Catálogo clínico de valoración por zonas. Cada zona trae sus movimientos (ROM),
// músculos (fuerza Daniels) y pruebas especiales agrupadas por tejido, con las
// opciones de resultado propias de cada prueba y su nota clínica.

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

const CADERA_PELVIS: ZoneCatalog = {
  id: 'cadera_pelvis',
  label: 'Cadera y pelvis',
  movements: [
    'Flexión',
    'Extensión',
    'Abducción',
    'Aducción',
    'Rotación interna',
    'Rotación externa'
  ],
  muscles: [
    'Psoas ilíaco',
    'Glúteo mayor',
    'Glúteo medio',
    'Glúteo menor',
    'Tensor de la fascia lata',
    'Aductores (largo/corto/mayor)',
    'Piriforme / Rotadores externos',
    'Isquiotibiales (origen pélvico)'
  ],
  specialTests: [
    {
      group: 'Reglas de decisión clínica (descarte de fracturas)',
      name: 'FABER / Patrick (patología coxofemoral y sacroilíaca)',
      options: ['Positivo coxofemoral', 'Positivo sacroilíaco', 'Negativo', 'No valorado']
    },
    {
      group: 'Intraarticular / Labrum (pinzamiento femoroacetabular)',
      name: 'FADIR (flexión + aducción + rotación interna)',
      note: 'Prueba de elección para FAI y lesión de labrum acetabular.'
    },
    {
      group: 'Intraarticular / Labrum (pinzamiento femoroacetabular)',
      name: 'Scour / Cuadrante de la cadera',
      options: ['Dolor articular', 'Crepitación', 'Negativo', 'No valorado'],
      note: 'Compresión axial con circunducción: detecta degeneración intraarticular.'
    },
    {
      group: 'Intraarticular / Labrum (pinzamiento femoroacetabular)',
      name: 'Log Roll (rotación pasiva en decúbito)',
      note: 'Localiza dolor puramente intraarticular sin tensión de tejidos blandos.'
    },
    {
      group: 'Sacroilíaca — Cluster Laslett',
      name: 'Distracción sacroilíaca'
    },
    {
      group: 'Sacroilíaca — Cluster Laslett',
      name: 'Compresión sacroilíaca'
    },
    {
      group: 'Sacroilíaca — Cluster Laslett',
      name: 'Thrust posterior (P4 / Thigh Thrust)',
      note: '≥3 pruebas positivas del Cluster Laslett = alta probabilidad de disfunción sacroilíaca.'
    },
    {
      group: 'Sacroilíaca — Cluster Laslett',
      name: 'Gaenslen (bilateral: L5 vs S1-S2)'
    },
    {
      group: 'Muscular / Bursitis / Trocánter',
      name: 'Signo de Trendelenburg',
      options: ['Positivo (caída pélvica)', 'Negativo', 'No valorado'],
      note: 'Debilidad de glúteo medio ipsilateral o lesión de raíz L5.'
    },
    {
      group: 'Muscular / Bursitis / Trocánter',
      name: 'Ober (retracción del TFL / cintilla iliotibial)'
    },
    {
      group: 'Muscular / Bursitis / Trocánter',
      name: 'Thomas (retracción del psoas)',
      options: ['Positivo (caída del muslo > 0°)', 'Negativo', 'No valorado']
    },
    {
      group: 'Muscular / Bursitis / Trocánter',
      name: 'Palpación trocánter mayor (bursitis trocantérea)',
      options: ['Doloroso', 'Sin dolor', 'No valorado']
    },
    {
      group: 'Neurológico / Funcional',
      name: 'SLR / Lasègue (diferenciación lumbar vs cadera)',
      options: ['Positivo <45° (neural)', 'Positivo 45-70°', 'Negativo', 'No valorado']
    },
    {
      group: 'Neurológico / Funcional',
      name: 'Single Leg Stance (estabilidad pélvica monopodal)',
      options: ['Logrado >10 s', 'Con inestabilidad', 'No logrado']
    },
    {
      group: 'Neurológico / Funcional',
      name: 'Sentadilla monopodal (valgo dinámico de cadera)',
      options: ['Adecuado', 'Valgo dinámico', 'No logrado']
    }
  ]
};

const COLUMNA_LUMBAR: ZoneCatalog = {
  id: 'columna_lumbar',
  label: 'Columna lumbar',
  movements: [
    'Flexión',
    'Extensión',
    'Flexión lateral derecha',
    'Flexión lateral izquierda',
    'Rotación derecha',
    'Rotación izquierda'
  ],
  muscles: [
    'Erector espinal',
    'Multífidos',
    'Cuadrado lumbar',
    'Psoas ilíaco',
    'Transverso abdominal / Core',
    'Glúteo mayor'
  ],
  specialTests: [
    {
      group: 'Neurológico / Radicular (tensión neural)',
      name: 'SLR / Lasègue',
      options: ['Positivo <45° (alta especificidad)', 'Positivo 45-70°', 'Negativo', 'No valorado'],
      note: 'Sensibiliza raíces L4-L5-S1. Ángulo positivo < 45° es altamente sugestivo de hernia.'
    },
    {
      group: 'Neurológico / Radicular (tensión neural)',
      name: 'SLR cruzado / Well Leg Raise',
      note: 'Alta especificidad para hernia discal mediana o extruida.'
    },
    {
      group: 'Neurológico / Radicular (tensión neural)',
      name: 'Slump Test',
      options: [
        'Positivo con diferenciación sensitizante',
        'Positivo sin diferenciación',
        'Negativo',
        'No valorado'
      ],
      note: 'Mayor sensibilidad que SLR; útil en síntomas distales no reproducidos con SLR.'
    },
    {
      group: 'Neurológico / Radicular (tensión neural)',
      name: 'Signo de Bragard (dorsiflexión de tobillo en SLR positivo)',
      note: 'Aumenta especificidad del SLR para irritación radicular.'
    },
    {
      group: 'Discal / McKenzie',
      name: 'Extensión en prono (Press-up McKenzie)',
      options: ['Centralización', 'Periferización', 'Sin cambio', 'No valorado'],
      note: 'Centralización de síntomas = signo pronóstico favorable.'
    },
    {
      group: 'Discal / McKenzie',
      name: 'Flexión repetida en carga (McKenzie)',
      options: ['Centralización', 'Periferización', 'Sin cambio', 'No valorado']
    },
    {
      group: 'Facetaria / Degenerativa',
      name: 'Kemp / Cuadrante lumbar (extensión + rotación ipsilateral)',
      note: 'Reproduce dolor local o referido por compresión facetaria.'
    },
    {
      group: 'Facetaria / Degenerativa',
      name: 'Compresión axial en bipedestación',
      options: ['Dolor local', 'Dolor referido', 'Negativo', 'No valorado']
    },
    {
      group: 'Inestabilidad lumbar',
      name: 'Prone Instability Test',
      options: ['Positivo (dolor cede al activar extensores)', 'Negativo', 'No valorado'],
      note: 'Sugiere inestabilidad segmentaria si el dolor desaparece con activación muscular.'
    },
    {
      group: 'Inestabilidad lumbar',
      name: 'Signo del arco de Gowers (patrón aberrante de movimiento)',
      options: ['Presente', 'Ausente', 'No valorado']
    },
    {
      group: 'Funcional / Pronóstico',
      name: 'Sorensen (resistencia de extensores lumbares)',
      input: 'seconds',
      note: 'Tiempo en segundos. < 176 s (♂) / < 146 s (♀) = déficit de resistencia.'
    },
    {
      group: 'Funcional / Pronóstico',
      name: 'Flexión de tronco (sit-and-reach modificado)',
      input: 'text',
      note: 'Registrar distancia en cm: manos a pies.'
    }
  ]
};

const COLUMNA_CERVICAL: ZoneCatalog = {
  id: 'columna_cervical',
  label: 'Columna cervical',
  movements: [
    'Flexión',
    'Extensión',
    'Flexión lateral derecha',
    'Flexión lateral izquierda',
    'Rotación derecha',
    'Rotación izquierda'
  ],
  muscles: [
    'Esternocleidomastoideo',
    'Escalenos (ant./med./post.)',
    'Trapecio superior',
    'Elevador de la escápula',
    'Esplenio / Semiesplenio',
    'Flexores profundos cervicales (FPC)'
  ],
  specialTests: [
    {
      group: 'Seguridad vascular / Inestabilidad ligamentaria',
      name: 'Prueba de la arteria vertebral (VBI / SVBI)',
      options: ['Síntomas de alarma (detener valoración)', 'Negativo', 'No valorado'],
      note: 'Mareo, nistagmo, disartria, diplopía o caída = contraindicación de terapia manual cervical.'
    },
    {
      group: 'Seguridad vascular / Inestabilidad ligamentaria',
      name: 'Sharp-Purser (inestabilidad C1-C2 en AR / Down)',
      options: ['Positivo (deslizamiento)', 'Negativo', 'No valorado'],
      note: 'Prioritario en artritis reumatoide o síndrome de Down.'
    },
    {
      group: 'Radicular — Cluster Wainner',
      name: 'Spurling (compresión foraminal)',
      note: '≥3 pruebas positivas del cluster = alta probabilidad de radiculopatía cervical.'
    },
    {
      group: 'Radicular — Cluster Wainner',
      name: 'Distracción manual cervical',
      options: ['Positivo (alivio de síntomas)', 'Sin cambio', 'No valorado'],
      note: 'Alivia síntomas al descargar el foramen.'
    },
    {
      group: 'Radicular — Cluster Wainner',
      name: 'Rotación cervical ipsilateral < 60°',
      options: ['Sí (< 60°)', 'No (≥ 60°)', 'No valorado']
    },
    {
      group: 'Radicular — Cluster Wainner',
      name: 'Upper Limb Tension Test A / ULTT-A (mediano)',
      options: [
        'Positivo con diferenciación',
        'Positivo sin diferenciación',
        'Negativo',
        'No valorado'
      ]
    },
    {
      group: 'Facetaria cervical',
      name: 'Cuadrante cervical (extensión + rotación + flexión lat. ipsilateral)',
      note: 'Reproduce dolor local o referido cefálico por compresión facetaria.'
    },
    {
      group: 'Facetaria cervical',
      name: 'Compresión axial en bipedestación',
      options: ['Dolor local', 'Dolor referido', 'Negativo', 'No valorado']
    },
    {
      group: 'Funcional / Latigazo / Estabilidad profunda',
      name: 'Cranio-Cervical Flexion Test (CCFT — 5 etapas)',
      options: ['Logra 5 etapas', 'Logra 1-4 etapas', 'No logra', 'No valorado'],
      note: 'Evalúa fuerza y resistencia de flexores profundos (longus colli/capitis).'
    },
    {
      group: 'Funcional / Latigazo / Estabilidad profunda',
      name: 'Flexión-Rotación (movilidad C1-C2)',
      options: ['< 32° ipsilateral (hipomóvil)', 'Normal (≥ 32°)', 'No valorado'],
      note: 'Referencia para cefalea cervicogénica (C1-C2 disfunción).'
    }
  ]
};

const HOMBRO: ZoneCatalog = {
  id: 'hombro',
  label: 'Hombro',
  movements: [
    'Flexión',
    'Extensión',
    'Abducción',
    'Aducción',
    'Rotación interna',
    'Rotación externa',
    'Elevación en el plano escapular (ERCS)'
  ],
  muscles: [
    'Supraespinoso',
    'Infraespinoso',
    'Redondo menor',
    'Subescapular',
    'Deltoides (ant./med./post.)',
    'Bíceps braquial',
    'Trapecio (superior/medio/inferior)',
    'Serrato anterior'
  ],
  specialTests: [
    {
      group: 'Manguito rotador',
      name: 'Jobe / Empty Can (supraespinoso)',
      note: 'Abducción 90° en ERCS, rotación interna, resistencia hacia abajo.'
    },
    {
      group: 'Manguito rotador',
      name: 'Full Can (supraespinoso — variante)',
      note: 'Menor dolor que Empty Can; alta especificidad para lesión supraespinoso.'
    },
    {
      group: 'Manguito rotador',
      name: 'Patte (infraespinoso / redondo menor)',
      note: 'Rotación externa con codo 90° a 90° de abducción; signo de caída = ruptura.'
    },
    {
      group: 'Manguito rotador',
      name: 'Lift-off (subescapular)',
      options: ['Positivo (no mantiene posición)', 'Negativo', 'No valorado'],
      note: 'Coloca dorso de mano en región lumbar e intenta alejarlo del cuerpo.'
    },
    {
      group: 'Manguito rotador',
      name: 'Belly Press (subescapular — variante)',
      note: 'Útil si ROM limitado impide Lift-off.'
    },
    {
      group: 'Manguito rotador',
      name: 'External Rotation Lag Sign (ERLS)',
      options: ['Lag presente (ruptura)', 'Sin lag', 'No valorado'],
      note: 'Alta especificidad para ruptura completa de infraespinoso.'
    },
    {
      group: 'Síndrome de pinzamiento subacromial',
      name: 'Neer',
      note: 'Elevación forzada con pronación; reproduce dolor subacromial.'
    },
    {
      group: 'Síndrome de pinzamiento subacromial',
      name: 'Hawkins-Kennedy',
      note: 'Flexión 90° + rotación interna; mayor sensibilidad que Neer.'
    },
    {
      group: 'Síndrome de pinzamiento subacromial',
      name: 'Yocum',
      note: 'Elevación activa con mano en hombro contralateral.'
    },
    {
      group: 'Bíceps / SLAP',
      name: 'Speed (bíceps / SLAP)',
      note: 'Flexión con codo extendido y supinación contra resistencia.'
    },
    {
      group: 'Bíceps / SLAP',
      name: 'Yergason (bíceps)',
      note: 'Supinación con codo flexionado 90° contra resistencia.'
    },
    {
      group: 'Bíceps / SLAP',
      name: "O'Brien (SLAP / AC)",
      note: 'Flexión 90°, aducción 15°: resistencia con rotación interna luego externa; dolor interno = SLAP.'
    },
    {
      group: 'Inestabilidad glenohumeral',
      name: 'Aprehensión anterior + Recolocación (Apprehension-Relocation)',
      options: [
        'Aprehensión (inestabilidad)',
        'Dolor sin aprehensión (pinzamiento)',
        'Negativo',
        'No valorado'
      ]
    },
    {
      group: 'Inestabilidad glenohumeral',
      name: 'Cajón anterior / posterior (Load and Shift)',
      options: ['Grado I (< 25%)', 'Grado II (25-50%)', 'Grado III (> 50%)', 'Negativo']
    },
    {
      group: 'Inestabilidad glenohumeral',
      name: 'Sulcus Sign (inestabilidad inferior / multidireccional)',
      options: ['Grado I (< 1 cm)', 'Grado II (1-2 cm)', 'Grado III (> 2 cm)', 'Negativo']
    },
    {
      group: 'Articulación acromioclavicular (AC)',
      name: 'Crossbody Adduction / Aducción horizontal forzada',
      note: 'Reproduce dolor en AC; también puede activar SLAP.'
    },
    {
      group: 'Articulación acromioclavicular (AC)',
      name: 'Paxinos (compresión AC)',
      note: 'Presión superior sobre la clavícula distal mientras se sostiene el acromion.'
    },
    {
      group: 'Escapulotorácica',
      name: 'Kibler Lateral Slide Test (asimetría escapular)',
      options: ['Asimetría > 1.5 cm', 'Simétrico', 'No valorado']
    },
    {
      group: 'Escapulotorácica',
      name: 'Pec Minor Length (longitud del pectoral menor)',
      options: ['Acortado (coracoide < 2.5 cm del plano)', 'Normal', 'No valorado']
    }
  ]
};

const CODO_ANTEBRAZO: ZoneCatalog = {
  id: 'codo_antebrazo',
  label: 'Codo y antebrazo',
  movements: ['Flexión', 'Extensión', 'Pronación', 'Supinación'],
  muscles: [
    'Bíceps braquial',
    'Braquial',
    'Braquiorradial',
    'Tríceps braquial',
    'Pronador redondo',
    'Flexores del carpo (FCR / FCU)',
    'Extensores del carpo (ECRL / ECRB / ECU)'
  ],
  specialTests: [
    {
      group: 'Epicondilalgia lateral (codo de tenista)',
      name: 'Cozen (extensión de muñeca con resistencia)',
      note: 'Alta sensibilidad; reproduce dolor en epicóndilo lateral.'
    },
    {
      group: 'Epicondilalgia lateral (codo de tenista)',
      name: 'Mills (extensión pasiva de codo con pronosupinación y flexión de muñeca)'
    },
    {
      group: 'Epicondilalgia lateral (codo de tenista)',
      name: 'Maudsley / Middle Finger Test (extensor del dedo medio)',
      note: 'Compresión selectiva del ECRB.'
    },
    {
      group: 'Epicondilalgia medial (codo de golfista)',
      name: 'Flexión de muñeca con resistencia (epitróclea)',
      note: 'Flexión de muñeca + pronación contra resistencia con codo extendido.'
    },
    {
      group: 'Epicondilalgia medial (codo de golfista)',
      name: 'Valgus Stress en flexión 70° (colgante)',
      note: 'También evalúa LCM medial (diferenciación tendinosa vs ligamentaria).'
    },
    {
      group: 'Inestabilidad ligamentaria del codo',
      name: 'Bostezo en valgo / Valgus Stress Test (LCM — 30° de flexión)',
      options: ['Inestable', 'Estable', 'No valorado'],
      note: 'Evaluar con codo 30° de flexión para desbloquear el olécranon.'
    },
    {
      group: 'Inestabilidad ligamentaria del codo',
      name: 'Moving Valgus Stress Test (LCM)',
      note: 'Alta sensibilidad/especificidad; dolor en arco 70-120° = positivo.'
    },
    {
      group: 'Inestabilidad ligamentaria del codo',
      name: 'Lateral Pivot Shift (inestabilidad rotatoria posterolateral — LCL)',
      options: ['Positivo (aprehensión / luxación)', 'Negativo', 'No valorado']
    },
    {
      group: 'Neurológico (atrapamientos)',
      name: 'Tinel en codo / Sulco cubital (nervio cubital)',
      note: 'Parestesias en territorio cubital (4.° y 5.° dedos).'
    },
    {
      group: 'Neurológico (atrapamientos)',
      name: 'Prueba de flexión de codo mantenida (cubital en el sulco)',
      input: 'seconds',
      note: 'Flexión máxima 60 s; parestesias = atrapamiento del nervio cubital.'
    },
    {
      group: 'Neurológico (atrapamientos)',
      name: 'Tinel en túnel radial (nervio radial profundo / síndrome del túnel radial)',
      note: 'Sensibilidad a 4-5 cm distal al epicóndilo lateral.'
    },
    {
      group: 'Ruptura tendinosa',
      name: 'Popeye Sign (ruptura distal del bíceps)',
      options: ['Presente (retracción del vientre)', 'Ausente', 'No valorado']
    },
    {
      group: 'Ruptura tendinosa',
      name: 'Biceps Squeeze Test (ruptura bíceps distal)',
      note: 'Compresión del vientre del bíceps: no supina = ruptura.'
    }
  ]
};

const MANO_MUNECA: ZoneCatalog = {
  id: 'mano_muneca',
  label: 'Mano y muñeca',
  movements: [
    'Flexión de muñeca',
    'Extensión de muñeca',
    'Desviación radial',
    'Desviación cubital',
    'Pronación',
    'Supinación',
    'Flexión de dedos',
    'Extensión de dedos',
    'Oponencia del pulgar'
  ],
  muscles: [
    'Flexor radial del carpo',
    'Flexor cubital del carpo',
    'Extensor radial largo/corto',
    'Extensor cubital del carpo',
    'Abductor largo del pulgar',
    'Extensor corto/largo del pulgar',
    'Interóseos dorsales / palmares',
    'Lumbricales',
    'Oponente del pulgar / Tenar'
  ],
  specialTests: [
    {
      group: 'Neurológico — Síndrome del túnel carpiano (nervio mediano)',
      name: 'Phalen (flexión mantenida de muñecas 60 s)',
      input: 'seconds',
      note: 'Inicio de parestesias en segundos; < 30 s = alta probabilidad.'
    },
    {
      group: 'Neurológico — Síndrome del túnel carpiano (nervio mediano)',
      name: 'Tinel en muñeca (nervio mediano)',
      note: 'Percusión sobre el retináculo flexor; parestesias en 1.°-3.° dedos.'
    },
    {
      group: 'Neurológico — Síndrome del túnel carpiano (nervio mediano)',
      name: 'Durkan / Compresión carpal directa',
      input: 'seconds',
      note: 'Mayor especificidad que Phalen o Tinel; 30 s de compresión directa.'
    },
    {
      group: 'Neurológico — Canal de Guyón (nervio cubital)',
      name: 'Tinel en canal de Guyón',
      note: 'Parestesias en 4.° y 5.° dedos; diferencia atrapamiento en canal de Guyón vs sulco cubital.'
    },
    {
      group: 'Neurológico — Canal de Guyón (nervio cubital)',
      name: 'Signo de Froment (rama profunda cubital / abductor del pulgar)',
      options: ['Positivo (flexión del pulgar al sujetar papel)', 'Negativo', 'No valorado']
    },
    {
      group: 'Tendinosa — Estiloides radial / De Quervain',
      name: 'Finkelstein (De Quervain — APL / EPB)',
      options: ['Positivo (dolor intenso en estiloides)', 'Leve', 'Negativo', 'No valorado'],
      note: 'Pulgar en puño + desviación cubital pasiva. Alta sensibilidad para De Quervain.'
    },
    {
      group: 'Tendinosa — Estiloides radial / De Quervain',
      name: 'Resistencia a extensión del pulgar (EPL / tendón extensor)',
      note: 'Diferencia tendinitis del extensor propio del pulgar.'
    },
    {
      group: 'Ligamentaria / TFCC (fibrocartílago triangular)',
      name: 'Watson / Scaphoid Shift Test (inestabilidad escafoides-semilunar)',
      options: ['Positivo (salto del escafoides)', 'Negativo', 'No valorado'],
      note: 'Alta especificidad para inestabilidad carpiana escafolunar.'
    },
    {
      group: 'Ligamentaria / TFCC (fibrocartílago triangular)',
      name: 'Press Test TFCC (compresión ulnar de la muñeca)',
      note: 'Apoyo en silla con la palma: dolor en compartimento ulnar = TFCC.'
    },
    {
      group: 'Ligamentaria / TFCC (fibrocartílago triangular)',
      name: 'Piano Key Sign (articulación radiocubital distal)',
      options: ['Positivo (inestabilidad DRUJ)', 'Negativo', 'No valorado']
    },
    {
      group: 'Ligamentaria / TFCC (fibrocartílago triangular)',
      name: 'Shear Test / Grind ulnar (TFCC)',
      note: 'Compresión + rotación del cúbito distal; reproduce dolor en TFCC.'
    },
    {
      group: 'Artrosis / Articular',
      name: 'Grind Test (articulación trapeciometacarpiana — pulgar)',
      options: ['Positivo (dolor + crepitación)', 'Negativo', 'No valorado'],
      note: 'Compresión axial + circunducción del primer metacarpiano; rizartrosis.'
    },
    {
      group: 'Artrosis / Articular',
      name: 'Bostezo de colateral interfalángico (estabilidad ligamentaria de dedos)',
      options: ['Inestable', 'Estable', 'No valorado']
    },
    {
      group: 'Vascular',
      name: 'Test de Allen (permeabilidad arterial)',
      options: [
        'Normal bilateral (< 5 s)',
        'Allen radial alterado (> 5 s)',
        'Allen cubital alterado (> 5 s)',
        'No valorado'
      ],
      note: 'Esencial antes de cateterismo radial o evaluación de síndrome compartimental.'
    }
  ]
};

// Orden en el que aparecen las zonas en el selector.
export const ZONE_CATALOGS: ZoneCatalog[] = [
  TOBILLO_PIE,
  RODILLA,
  CADERA_PELVIS,
  COLUMNA_LUMBAR,
  COLUMNA_CERVICAL,
  HOMBRO,
  CODO_ANTEBRAZO,
  MANO_MUNECA
];

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

// Banderas amarillas: factores psicosociales que retrasan la recuperación.
export const YELLOW_FLAG_OPTIONS = [
  'Miedo al movimiento / kinesiofobia',
  'Catastrofización del dolor',
  'Expectativas irreales del tratamiento',
  'Creencias erróneas sobre el dolor o la lesión',
  'Bajo estado de ánimo / ansiedad',
  'Conductas de evitación / sobreprotección',
  'Baja autoeficacia para el autocuidado',
  'Conflicto laboral o ganancia secundaria',
  'Aislamiento o falta de apoyo social'
] as const;

// Escalas funcionales (PROMs) frecuentes en fisioterapia.
export const FUNCTIONAL_SCALE_OPTIONS = [
  'DASH (miembro superior)',
  'QuickDASH (miembro superior)',
  'LEFS (miembro inferior)',
  'Oswestry / ODI (columna lumbar)',
  'NDI (columna cervical)',
  'WOMAC (cadera/rodilla)',
  'SPADI (hombro)',
  'KOOS (rodilla)',
  'FAAM (tobillo/pie)',
  'SPPB (función física global)',
  'Tampa / TSK (kinesiofobia)',
  'PSFS (escala funcional específica del paciente)'
] as const;

export const SYMPTOM_CLASSIFICATION = ['Agudo', 'Subagudo', 'Crónico'] as const;
export const INJURY_MECHANISM = [
  'Insidioso',
  'Traumático',
  'Movimiento repetitivo',
  'Postural / sobrecarga'
] as const;
export const PAIN_TYPE_OPTIONS = ['Punzante', 'Sordo', 'Urente', 'Irradiado', 'Opresivo'] as const;
