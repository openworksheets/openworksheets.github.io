// Traducción de la descripción «semántica» que emite la IA al campo real del
// manifiesto de OpenWorksheets.
//
// La IA no escribe el `config` interno de cada tipo (frágil y lleno de banderas
// de normalización): escribe lo mínimo indispensable —qué se pregunta y cuál es
// la respuesta— y aquí se completa con los mismos valores por defecto que usa
// el editor (js/fieldtypes.js). Es el mismo principio que ya aplica
// js/aiimport.js, pero conservando la posición sobre el documento.

// Tipos que la IA puede describir de forma semántica. Además de las preguntas,
// se incluyen los elementos de diseño que no necesitan cargar un archivo: texto,
// tapado, líneas y formas. Los medios y paquetes externos siguen fuera porque
// exigen importar, validar y empaquetar recursos binarios.
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
  // Huecos sobre el propio documento: cada hueco es un recuadro colocado encima
  // de la línea impresa. Es el compañero natural de los huecos que detecta
  // read_layout (rachas de guiones bajos y líneas para escribir).
  textboxes: {
    label: 'huecos para escribir marcados sobre el documento (cada hueco lleva su rect y sus respuestas)',
    defRect: { w: 0.12, h: 0.03 },
    build: s => ({
      boxes: asList(s.boxes).map(b => ({
        id: subId('tb'),
        rect: b?.rect,
        answers: asList(b?.answers, b?.answer).map(String).filter(a => a.trim())
      })),
      ignoreCase: s.ignoreCase !== false,
      ignoreAccents: s.ignoreAccents !== false,
      collapseSpaces: s.collapseSpaces !== false
    }),
    check: c => {
      if (!c.boxes.length) return 'no tiene ningún hueco';
      const vacíos = c.boxes.filter(b => !b.answers.length).length;
      return vacíos ? `${vacíos} hueco(s) sin respuesta: no se podrán acertar` : null;
    }
  },
  // Casillas dibujadas libremente sobre el documento (para marcar la opción
  // correcta en un cuestionario impreso, por ejemplo).
  checkbox: {
    label: 'casillas para marcar sobre el documento (cada casilla lleva su rect y si es correcta)',
    defRect: { w: 0.035, h: 0.025 },
    build: s => {
      const boxes = asList(s.boxes).map(b => ({ id: subId('cb'), rect: b?.rect, correcta: Boolean(b?.correct) }));
      const correct = boxes.filter(b => b.correcta).map(b => b.id);
      return {
        boxes: boxes.map(({ id, rect }) => ({ id, rect })),
        multiple: s.multiple != null ? Boolean(s.multiple) : correct.length > 1,
        correct,
        partial: Boolean(s.partial)
      };
    },
    check: c => {
      if (!c.boxes.length) return 'no tiene ninguna casilla';
      return c.correct.length ? null : 'ninguna casilla está marcada como correcta';
    }
  },
  // Tabla que rellena el alumnado. Se describe por filas de respuestas, como se
  // leería en el papel; las opciones de corrección se completan aquí.
  table: {
    label: 'tabla editable (colHeaders, rowHeaders y rows con las respuestas de cada celda)',
    defRect: { w: 0.42, h: 0.2 },
    build: s => {
      const filas = asList(s.rows).map(f => asList(f));
      const rows = Math.max(1, filas.length);
      const cols = Math.max(1, ...filas.map(f => f.length), asList(s.colHeaders).length);
      const colHeaders = Array.from({ length: cols }, (_, c) => String(asList(s.colHeaders)[c] ?? ''));
      const rowHeaders = Array.from({ length: rows }, (_, r) => String(asList(s.rowHeaders)[r] ?? ''));
      // Cada celda admite varias respuestas válidas: se acepta "a|b" o una lista.
      const cellAnswers = Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => {
          const v = filas[r]?.[c];
          const lista = Array.isArray(v) ? v : String(v ?? '').split('|');
          const limpias = lista.map(x => String(x).trim()).filter(Boolean);
          return limpias.length ? limpias : [''];
        }));
      const examples = Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => Boolean(asList(s.examples)[r]?.[c])));
      return {
        rows, cols, rowHeaders, colHeaders,
        cells: cellAnswers.map(f => f.map(a => a[0] ?? '')),
        cellAnswers, examples,
        cellTypes: Array.from({ length: rows }, () => Array.from({ length: cols }, () => 'text')),
        cellTolerance: Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0)),
        cellSelect: Array.from({ length: rows }, () => Array.from({ length: cols }, () => false)),
        cellCorrect: Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0)),
        correctMode: ['cell', 'row', 'col'].includes(s.correctMode) ? s.correctMode : 'cell',
        showColHeaders: s.showColHeaders !== false && colHeaders.some(h => h.trim()),
        showRowHeaders: s.showRowHeaders !== false && rowHeaders.some(h => h.trim()),
        ignoreCase: s.ignoreCase !== false,
        ignoreAccents: s.ignoreAccents !== false,
        collapseSpaces: s.collapseSpaces !== false
      };
    },
    check: c => c.cellAnswers.flat().some(a => a.some(x => x.trim()))
      ? null : 'ninguna celda tiene respuesta: no se corregirá'
  },
  // Grabación de voz. Por defecto la puntúa el profesor al revisar la entrega.
  record: {
    label: 'grabación de voz (la puntúa el profesor, salvo scoreMode "participation")',
    defRect: { w: 0.4, h: 0.1 },
    build: s => ({
      scoreMode: s.scoreMode === 'participation' ? 'participation' : 'manual',
      maxSec: Math.max(5, parseInt(s.maxSec, 10) || 30),
      prompt: String(s.prompt || ''),
      promptBold: true, promptColor: '', promptAlign: 'left', promptScale: 1
    })
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
      align: ['left', 'center', 'right'].includes(s.align) ? s.align : 'left',
      ...(s.section ? { section: true } : {})
    })
  },
  cover: {
    label: 'tapar una zona del documento (no puntúa)',
    decor: true,
    defRect: { w: 0.25, h: 0.05 },
    build: s => ({ color: String(s.color || '#ffffff'), opacity: s.opacity == null ? 1 : Number(s.opacity) })
  },
  line: {
    label: 'línea o flecha decorativa (no puntúa)',
    decor: true,
    defRect: { w: 0.25, h: 0.02 },
    build: s => ({
      color: String(s.color || '#1d2c42'),
      width: Math.max(0.5, Number(s.width) || 2),
      style: ['solid', 'dashed', 'dotted'].includes(s.style) ? s.style : 'solid',
      dir: ['h', 'v', 'd1', 'd2'].includes(s.dir) ? s.dir : 'h',
      heads: ['none', 'end', 'both'].includes(s.heads) ? s.heads : 'none',
      invert: Boolean(s.invert)
    })
  },
  rect: {
    label: 'rectángulo decorativo, con borde y/o relleno (no puntúa)',
    decor: true,
    defRect: { w: 0.25, h: 0.12 },
    build: s => ({
      color: String(s.color || '#1d2c42'),
      width: Math.max(0.5, Number(s.width) || 2),
      style: ['solid', 'dashed', 'dotted'].includes(s.style) ? s.style : 'solid',
      noStroke: Boolean(s.noStroke),
      fill: String(s.fill || ''),
      fillOpacity: s.fillOpacity == null ? 1 : Math.max(0, Math.min(1, Number(s.fillOpacity))),
      borderRadius: Math.max(0, Math.min(50, Number(s.borderRadius) || 0)),
      square: Boolean(s.square)
    })
  },
  ellipse: {
    label: 'elipse o círculo decorativo, con borde y/o relleno (no puntúa)',
    decor: true,
    defRect: { w: 0.2, h: 0.12 },
    build: s => ({
      color: String(s.color || '#1d2c42'),
      width: Math.max(0.5, Number(s.width) || 2),
      style: ['solid', 'dashed', 'dotted'].includes(s.style) ? s.style : 'solid',
      noStroke: Boolean(s.noStroke),
      fill: String(s.fill || ''),
      fillOpacity: s.fillOpacity == null ? 1 : Math.max(0, Math.min(1, Number(s.fillOpacity))),
      circle: Boolean(s.circle)
    })
  },
  polygon: {
    label: 'polígono decorativo de 3 a 20 lados (no puntúa)',
    decor: true,
    defRect: { w: 0.18, h: 0.18 },
    build: s => ({
      sides: Math.max(3, Math.min(20, parseInt(s.sides, 10) || 5)),
      color: String(s.color || '#1d2c42'),
      width: Math.max(0.5, Number(s.width) || 2),
      style: ['solid', 'dashed', 'dotted'].includes(s.style) ? s.style : 'solid',
      noStroke: Boolean(s.noStroke),
      fill: String(s.fill || ''),
      fillOpacity: s.fillOpacity == null ? 1 : Math.max(0, Math.min(1, Number(s.fillOpacity))),
      regular: s.regular !== false
    })
  }
};

let subSeq = 0;
function subId(prefijo) {
  return prefijo + Math.random().toString(36).slice(2, 8) + (subSeq++).toString(36);
}
const zoneId = () => subId('z');

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
  // Fondo y color comunes a los campos de respuesta. Los constructores de cada
  // tipo no tienen que repetirlos, pero el visor los entiende en todos ellos.
  if (spec.bg) config.bg = String(spec.bg);
  if (spec.bgOpacity != null) config.bgOpacity = Math.max(0, Math.min(1, Number(spec.bgOpacity)));
  if (spec.fgColor) config.fgColor = String(spec.fgColor);
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
  if (spec.fontFamily) field.fontFamily = String(spec.fontFamily);
  if (Number.isFinite(Number(spec.rotate)) && Number(spec.rotate) !== 0) field.rotate = Number(spec.rotate);
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
