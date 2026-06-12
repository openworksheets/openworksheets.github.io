// Registro de los tipos de campo autocorregibles.
// Cada tipo define su nombre, un glifo para la paleta del editor,
// el tamaño inicial del rectángulo (en fracciones de página) y su
// configuración por defecto.

import { t } from './i18n.js';

export const FIELD_TYPES = {
  text: {
    name: 'Respuesta corta',
    glyph: 'abc',
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
    glyph: '123',
    defRect: { w: 0.16, h: 0.05 },
    defaults: () => ({ answer: '', tolerance: 0 })
  },
  single: {
    name: 'Opción única',
    glyph: '◉',
    defRect: { w: 0.3, h: 0.14 },
    defaults: () => ({ options: ['Opción 1', 'Opción 2', 'Opción 3'], correct: 0 })
  },
  truefalse: {
    name: 'Verdadero / falso',
    glyph: 'V·F',
    defRect: { w: 0.26, h: 0.06 },
    defaults: () => ({ correct: true, labels: ['Verdadero', 'Falso'] })
  },
  multi: {
    name: 'Opción múltiple',
    glyph: '☑',
    defRect: { w: 0.3, h: 0.16 },
    defaults: () => ({ options: ['Opción 1', 'Opción 2', 'Opción 3'], correct: [0], partial: false })
  },
  select: {
    name: 'Desplegable',
    glyph: '▾',
    defRect: { w: 0.2, h: 0.05 },
    defaults: () => ({ options: ['Opción 1', 'Opción 2'], correct: 0 })
  },
  gaps: {
    name: 'Completar huecos',
    glyph: 'a_c',
    defRect: { w: 0.45, h: 0.12 },
    defaults: () => ({
      text: 'El agua hierve a [100] grados.',
      ignoreCase: true,
      ignoreAccents: true,
      collapseSpaces: true
    })
  },
  match: {
    name: 'Emparejar',
    glyph: '⇄',
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
    glyph: '↕',
    defRect: { w: 0.34, h: 0.18 },
    defaults: () => ({ items: ['Primero', 'Segundo', 'Tercero'] })
  },
  dragdrop: {
    name: 'Arrastrar a zonas',
    glyph: '⊞',
    defRect: { w: 0.4, h: 0.09 },
    defaults: () => ({ zones: [], distractors: [] })
  },
  // Elementos decorativos: no puntúan ni cuentan como preguntas.
  label: {
    name: 'Texto',
    glyph: 'T',
    decor: true,
    defRect: { w: 0.3, h: 0.05 },
    defaults: () => ({ text: 'Texto', color: '#1d2c42', bold: false })
  },
  cover: {
    name: 'Tapar zona',
    glyph: '▩',
    decor: true,
    defRect: { w: 0.25, h: 0.07 },
    defaults: () => ({ color: '#ffffff' })
  }
};

export const FIELD_ORDER = [
  'text', 'number', 'single', 'truefalse', 'multi',
  'select', 'gaps', 'match', 'order', 'dragdrop',
  'label', 'cover'
];

export function isDecorField(type) {
  return Boolean(FIELD_TYPES[type]?.decor);
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
