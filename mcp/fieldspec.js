// Traducción de la descripción «semántica» que emite la IA al campo real del
// manifiesto de OpenWorksheets.
//
// La IA no escribe el `config` interno de cada tipo (frágil y lleno de banderas
// de normalización): escribe lo mínimo indispensable —qué se pregunta y cuál es
// la respuesta— y aquí se completa con los mismos valores por defecto que usa
// el editor (js/fieldtypes.js). Es el mismo principio que ya aplica
// js/aiimport.js, pero conservando la posición sobre el documento.

// Tipos admitidos en esta primera versión: los que ocupan un rectángulo y se
// entienden solos. Quedan fuera los que exigen colocar varios elementos
// relacionados en 2D (arrastrar a zonas, unir con flechas, huecos sobre el
// documento) y los que cargan paquetes externos (SCORM, embed).
const TYPES = {
  text: {
    label: 'respuesta corta escrita',
    defRect: { w: 0.24, h: 0.035 },
    build: s => ({
      answers: asList(s.answers, s.answer).map(String),
      ignoreCase: s.ignoreCase !== false,
      ignoreAccents: s.ignoreAccents !== false,
      collapseSpaces: s.collapseSpaces !== false
    }),
    check: c => c.answers.some(a => a.trim()) ? null : 'sin respuesta correcta: no se autocorregirá'
  },
  number: {
    label: 'respuesta numérica',
    defRect: { w: 0.16, h: 0.035 },
    build: s => ({
      answer: s.answer == null ? '' : String(s.answer),
      tolerance: Number(s.tolerance) || 0
    }),
    check: c => String(c.answer).trim() ? null : 'sin respuesta correcta: no se autocorregirá'
  },
  formula: {
    label: 'fórmula (LaTeX)',
    defRect: { w: 0.24, h: 0.05 },
    build: s => ({ answers: asList(s.answers, s.answer).map(String) }),
    check: c => c.answers.some(a => a.trim()) ? null : 'sin respuesta correcta: no se autocorregirá'
  },
  essay: {
    label: 'respuesta larga (la puntúa el profesor)',
    defRect: { w: 0.5, h: 0.14 },
    build: s => ({
      prompt: String(s.prompt || ''),
      promptBold: true, promptColor: '', promptAlign: 'left', promptScale: 1,
      rows: Math.max(2, parseInt(s.rows, 10) || 4),
      maxWords: parseInt(s.maxWords, 10) || 0,
      showFormula: s.showFormula !== false
    })
  },
  single: {
    label: 'opción única',
    defRect: { w: 0.3, h: 0.12 },
    build: s => ({ options: options(s), correct: idx(s.correct, options(s).length) }),
    check: c => c.options.length >= 2 ? null : 'necesita al menos dos opciones'
  },
  multi: {
    label: 'opción múltiple',
    defRect: { w: 0.3, h: 0.14 },
    build: s => ({
      options: options(s),
      correct: asList(s.correct).map(n => idx(n, options(s).length)),
      partial: Boolean(s.partial)
    }),
    check: c => c.options.length >= 2 ? null : 'necesita al menos dos opciones'
  },
  select: {
    label: 'desplegable',
    defRect: { w: 0.2, h: 0.035 },
    build: s => ({ options: options(s), correct: idx(s.correct, options(s).length) }),
    check: c => c.options.length >= 2 ? null : 'necesita al menos dos opciones'
  },
  truefalse: {
    label: 'verdadero / falso',
    defRect: { w: 0.26, h: 0.05 },
    build: s => ({
      correct: s.correct !== false && s.correct !== 'false' && s.correct !== 0,
      labels: asList(s.labels).length === 2 ? asList(s.labels).map(String) : ['Verdadero', 'Falso']
    })
  },
  gaps: {
    label: 'completar huecos (texto con [respuesta] entre corchetes)',
    defRect: { w: 0.45, h: 0.1 },
    build: s => ({
      text: String(s.text || ''),
      ignoreCase: s.ignoreCase !== false,
      ignoreAccents: s.ignoreAccents !== false,
      collapseSpaces: s.collapseSpaces !== false
    }),
    check: c => /\[[^\]]+\]/.test(c.text) ? null : 'el texto no tiene ningún hueco entre corchetes'
  },
  match: {
    label: 'emparejar dos columnas',
    defRect: { w: 0.42, h: 0.16 },
    build: s => ({
      pairs: asList(s.pairs).map(p => ({ left: String(p?.left ?? ''), right: String(p?.right ?? '') })),
      distractors: asList(s.distractors).map(String)
    }),
    check: c => c.pairs.length >= 2 ? null : 'necesita al menos dos parejas'
  },
  order: {
    label: 'ordenar elementos (en el orden correcto)',
    defRect: { w: 0.34, h: 0.16 },
    build: s => ({ items: asList(s.items).map(String) }),
    check: c => c.items.length >= 2 ? null : 'necesita al menos dos elementos'
  },
  // Arrastrar a zonas: el rectángulo del campo es la BANDEJA de donde parten las
  // etiquetas, y cada zona es un destino dibujado aparte sobre el documento.
  // Solo el modo «etiquetas escritas»: el modo «recortar del PDF» exige marcar
  // trozos de imagen de la página y se sigue haciendo en el editor.
  dragdrop: {
    label: 'arrastrar etiquetas a zonas marcadas del documento (rect = la bandeja de etiquetas; cada zona lleva su propio rect)',
    defRect: { w: 0.4, h: 0.08 },
    build: s => ({
      mode: 'labels',
      zones: asList(s.zones).map(z => ({
        id: zoneId(),
        rect: z?.rect,
        answers: asList(z?.answers, z?.answer).map(String).filter(a => a.trim())
      })),
      distractors: asList(s.distractors).map(String).filter(a => a.trim()),
      pieces: []
    }),
    check: c => {
      if (!c.zones.length) return 'no tiene ninguna zona de destino';
      const vacías = c.zones.filter(z => !z.answers.length).length;
      if (vacías) return `${vacías} zona(s) sin respuesta: no se podrán acertar`;
      return null;
    }
  },
  // Decorativos: no puntúan. Útiles para añadir instrucciones o tapar el hueco
  // impreso del PDF cuando el campo se coloca justo encima.
  label: {
    label: 'texto decorativo (no puntúa)',
    decor: true,
    defRect: { w: 0.3, h: 0.035 },
    build: s => ({
      text: String(s.text || ''),
      color: String(s.color || '#1d2c42'),
      bold: Boolean(s.bold),
      align: ['left', 'center', 'right'].includes(s.align) ? s.align : 'left'
    })
  },
  cover: {
    label: 'tapar una zona del documento (no puntúa)',
    decor: true,
    defRect: { w: 0.25, h: 0.05 },
    build: s => ({ color: String(s.color || '#ffffff'), opacity: s.opacity == null ? 1 : Number(s.opacity) })
  }
};

let zoneSeq = 0;
function zoneId() {
  return 'z' + Math.random().toString(36).slice(2, 8) + (zoneSeq++).toString(36);
}

function asList(...vals) {
  for (const v of vals) {
    if (Array.isArray(v)) return v;
    if (v != null && v !== '') return [v];
  }
  return [];
}

function options(s) {
  return asList(s.options).map(String);
}

function idx(v, len) {
  const n = parseInt(v, 10);
  if (!Number.isInteger(n) || n < 0 || (len && n >= len)) return 0;
  return n;
}

function isType(type) {
  return Object.prototype.hasOwnProperty.call(TYPES, type);
}

// Construye el campo del manifiesto a partir de la descripción semántica.
// Devuelve { field, warnings }. No valida el rectángulo: de eso se ocupa
// session.js, que es quien conoce el tamaño de la página y el resto de campos.
function buildField(spec, id) {
  const def = TYPES[spec.type];
  const config = def.build(spec);
  const warnings = [];
  const problem = def.check ? def.check(config) : null;
  if (problem) warnings.push(problem);

  const field = {
    id,
    type: spec.type,
    rect: spec.rect,
    points: def.decor ? 0 : (Number.isFinite(Number(spec.points)) ? Number(spec.points) : 1),
    fontScale: Number(spec.fontScale) || 1,
    config
  };
  if (!def.decor && spec.noScore) {
    field.noScore = true;
    field.points = 0;
  }
  return { field, warnings };
}

function typeList() {
  return Object.entries(TYPES).map(([id, d]) => `"${id}": ${d.label}`);
}

module.exports = { TYPES, isType, buildField, typeList };
