// Registro de los tipos de campo autocorregibles.
// Cada tipo define su nombre, un glifo (SVG Lucide) para la paleta del editor,
// el tamaño inicial del rectángulo (en fracciones de página) y su
// configuración por defecto.

import { t } from './i18n.js';
import { ICONS } from './icons.js';

export const FIELD_TYPES = {
  text: {
    name: 'Respuesta corta',
    glyph: ICONS.type,
    defRect: { w: 0.24, h: 0.05 },
    defaults: () => ({
      answers: [''],
      ignoreCase: true,
      ignoreAccents: true,
      collapseSpaces: true
    })
  },
  number: {
    name: 'Respuesta numérica',
    glyph: ICONS.hash,
    defRect: { w: 0.16, h: 0.05 },
    defaults: () => ({ answer: '', tolerance: 0 })
  },
  single: {
    name: 'Opción única',
    glyph: ICONS.circleDot,
    defRect: { w: 0.3, h: 0.14 },
    defaults: () => ({ options: ['Opción 1', 'Opción 2', 'Opción 3'], correct: 0 })
  },
  truefalse: {
    name: 'Verdadero / falso',
    glyph: ICONS.toggleLeft,
    defRect: { w: 0.26, h: 0.06 },
    defaults: () => ({ correct: true, labels: ['Verdadero', 'Falso'] })
  },
  multi: {
    name: 'Opción múltiple',
    glyph: ICONS.checkSquare,
    defRect: { w: 0.3, h: 0.16 },
    defaults: () => ({ options: ['Opción 1', 'Opción 2', 'Opción 3'], correct: [0], partial: false })
  },
  checkbox: {
    name: 'Casillas',
    glyph: ICONS.squareCheck,
    defRect: { w: 0.035, h: 0.025 },
    defaults: () => ({ boxes: [], multiple: false, correct: [], partial: false })
  },
  select: {
    name: 'Desplegable',
    glyph: ICONS.chevronsUpDown,
    defRect: { w: 0.2, h: 0.05 },
    defaults: () => ({ options: ['Opción 1', 'Opción 2'], correct: 0 })
  },
  gaps: {
    name: 'Completar huecos',
    glyph: ICONS.penLine,
    defRect: { w: 0.45, h: 0.12 },
    defaults: () => ({
      text: 'El agua hierve a [100] grados.',
      ignoreCase: true,
      ignoreAccents: true,
      collapseSpaces: true
    })
  },
  textboxes: {
    name: 'Huecos en documento',
    glyph: ICONS.textCursorInput,
    defRect: { w: 0.12, h: 0.045 },
    defaults: () => ({
      boxes: [],
      ignoreCase: true,
      ignoreAccents: true,
      collapseSpaces: true
    })
  },
  match: {
    name: 'Emparejar',
    glyph: ICONS.arrowLeftRight,
    defRect: { w: 0.42, h: 0.18 },
    defaults: () => ({
      pairs: [
        { left: 'Elemento A', right: 'Pareja A' },
        { left: 'Elemento B', right: 'Pareja B' }
      ],
      distractors: []
    })
  },
  order: {
    name: 'Ordenar',
    glyph: ICONS.arrowUpDown,
    defRect: { w: 0.34, h: 0.18 },
    defaults: () => ({ items: ['Primero', 'Segundo', 'Tercero'] })
  },
  dragdrop: {
    name: 'Arrastrar a zonas',
    glyph: ICONS.move,
    defRect: { w: 0.4, h: 0.09 },
    defaults: () => ({ zones: [], distractors: [] })
  },
  arrowmatch: {
    name: 'Unir con flechas',
    glyph: ICONS.gitCompare,
    defRect: { w: 0.6, h: 0.4 },
    defaults: () => {
      const mk = () => Math.random().toString(36).slice(2, 9);
      const [la, lb, ra, rb] = [mk(), mk(), mk(), mk()];
      return {
        items: [
          { id: la, side: 'left',  label: 'Elemento A', src: '' },
          { id: lb, side: 'left',  label: 'Elemento B', src: '' },
          { id: ra, side: 'right', label: 'Pareja A',   src: '' },
          { id: rb, side: 'right', label: 'Pareja B',   src: '' },
        ],
        pairs: [{ from: la, to: ra }, { from: lb, to: rb }]
      };
    }
  },
  // Elementos decorativos: no puntúan ni cuentan como preguntas.
  label: {
    name: 'Texto',
    glyph: ICONS.pencil,
    decor: true,
    defRect: { w: 0.3, h: 0.05 },
    defaults: () => ({ text: 'Texto', color: '#1d2c42', bold: false })
  },
  cover: {
    name: 'Tapar zona',
    glyph: ICONS.coverZone,
    decor: true,
    defRect: { w: 0.25, h: 0.07 },
    defaults: () => ({ color: '#ffffff' })
  },
  image: {
    name: 'Imagen',
    glyph: ICONS.image,
    decor: true,
    defRect: { w: 0.4, h: 0.3 },
    defaults: () => ({ src: '' })
  },
  // Formas de dibujo: para componer fichas desde una hoja en blanco.
  line: {
    name: 'Línea',
    glyph: ICONS.minus,
    decor: true,
    defRect: { w: 0.25, h: 0.02 },
    defaults: () => ({ color: '#1d2c42', width: 2, style: 'solid', dir: 'h' })
  },
  arrow: {
    name: 'Flecha',
    glyph: ICONS.arrowRight,
    decor: true,
    defRect: { w: 0.25, h: 0.02 },
    defaults: () => ({ color: '#1d2c42', width: 2, style: 'solid', dir: 'h', invert: false, double: false })
  },
  rect: {
    name: 'Rectángulo',
    glyph: ICONS.rectH,
    decor: true,
    defRect: { w: 0.25, h: 0.12 },
    defaults: () => ({ color: '#1d2c42', width: 2, style: 'solid', noStroke: false, fill: '', fillOpacity: 1, borderRadius: 0, square: false })
  },
  ellipse: {
    name: 'Elipse',
    glyph: ICONS.circle,
    decor: true,
    defRect: { w: 0.2, h: 0.12 },
    defaults: () => ({ color: '#1d2c42', width: 2, style: 'solid', noStroke: false, fill: '', fillOpacity: 1, circle: false })
  }
};

export const FIELD_ORDER = [
  'text', 'number', 'single', 'truefalse', 'multi', 'checkbox',
  'select', 'gaps', 'textboxes', 'match', 'order', 'dragdrop', 'arrowmatch',
  'label', 'cover', 'image', 'line', 'arrow', 'rect', 'ellipse'
];

// Grupos temáticos de la paleta del editor. El nombre visible
// se obtiene de i18n con la clave 'palette.<id>'.
export const PALETTE_GROUPS = [
  { id: 'write',  glyph: ICONS.pencil,         types: ['text', 'number', 'gaps', 'textboxes'] },
  { id: 'choose', glyph: ICONS.listChecks,      types: ['single', 'multi', 'checkbox', 'truefalse', 'select'] },
  { id: 'relate', glyph: ICONS.arrowLeftRight,  types: ['match', 'order', 'dragdrop', 'arrowmatch'] },
  { id: 'design', glyph: ICONS.shapes,          types: ['label', 'image', 'cover', 'line', 'arrow', 'rect', 'ellipse'] }
];

export function isDecorField(type) {
  return Boolean(FIELD_TYPES[type]?.decor);
}

const SHAPE_TYPES = new Set(['line', 'arrow', 'rect', 'ellipse']);

export function isShapeField(type) {
  return SHAPE_TYPES.has(type);
}

export function fieldTypeName(type) {
  return t('field.' + type) || (FIELD_TYPES[type] ? FIELD_TYPES[type].name : type);
}

// Extrae los huecos de un texto con marcadores [respuesta|alternativa].
// Devuelve una lista de segmentos: { kind: 'text'|'gap', value | answers }.
export function parseGaps(text) {
  const segments = [];
  const re = /\[([^\]]*)\]/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segments.push({ kind: 'text', value: text.slice(last, m.index) });
    const answers = m[1].split('|').map(s => s.trim()).filter(Boolean);
    segments.push({ kind: 'gap', answers: answers.length ? answers : [''] });
    last = re.lastIndex;
  }
  if (last < text.length) segments.push({ kind: 'text', value: text.slice(last) });
  return segments;
}

export function gapCount(text) {
  return parseGaps(text).filter(s => s.kind === 'gap').length;
}
