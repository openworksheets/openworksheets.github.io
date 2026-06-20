// Creación de fichas con ayuda de IA — SIN llamadas externas ni APIs.
//
// El flujo es totalmente manual y respeta la independencia de OpenWorksheets:
//   1) El profesor rellena un formulario (tema, nivel, idioma, nº de preguntas,
//      tipos permitidos…) y OWS genera un PROMPT de texto.
//   2) El profesor copia ese prompt, lo pega en el chat de la IA que prefiera
//      (Claude, ChatGPT, Gemini…) y la IA responde con un JSON.
//   3) El profesor pega ese JSON en OWS, que lo valida y, si es coherente,
//      construye la ficha colocando los campos de forma automática y legible.
//
// La IA NO genera el manifest interno de OWS (frágil): genera un JSON
// «intermedio» semántico y simple. Este módulo lo traduce a campos reales con
// auto-layout, de modo que el contrato con la IA no depende del formato interno.

import { uid } from './util.js';
import { normalizeTableConfig } from './fieldtypes.js';
import { t } from './i18n.js';

// Tipos que la IA puede generar en el JSON intermedio. Cada uno define cómo se
// describe en el prompt y cómo se mapea a un campo real de OWS. Los tipos que
// requieren posicionar elementos en 2D (arrastrar a zonas, unir con flechas,
// huecos sobre un documento) quedan fuera: no encajan en un auto-layout lineal.
export const AI_TYPES = ['label', 'text', 'number', 'formula', 'truefalse',
  'single', 'multi', 'select', 'essay', 'gaps', 'table', 'match', 'order'];

// ---------------------------------------------------------------------------
// 1) Generación del prompt
// ---------------------------------------------------------------------------

// Descripción de cada tipo para el prompt: la «forma» del objeto JSON que la IA
// debe emitir por cada item. Se incluye solo la de los tipos que el profesor ha
// permitido, para no abrumar al modelo ni invitar a usar tipos no deseados.
const TYPE_SPECS = {
  label:     '{ "type": "label", "text": "Título o instrucción (admite **negrita** y fórmulas LaTeX con \\\\(…\\\\))" }',
  text:      '{ "type": "text", "prompt": "Enunciado", "answers": ["respuesta", "sinónimo aceptado"] }',
  number:    '{ "type": "number", "prompt": "Enunciado", "answer": 42, "tolerance": 0 }',
  formula:   '{ "type": "formula", "prompt": "Enunciado", "answers": ["\\\\frac{1}{2}"] }',
  truefalse: '{ "type": "truefalse", "prompt": "Afirmación", "correct": true }',
  single:    '{ "type": "single", "prompt": "Enunciado", "options": ["A", "B", "C"], "correct": 0 }',
  multi:     '{ "type": "multi", "prompt": "Enunciado", "options": ["A", "B", "C"], "correct": [0, 2] }',
  select:    '{ "type": "select", "prompt": "Enunciado", "options": ["A", "B"], "correct": 1 }',
  essay:     '{ "type": "essay", "prompt": "Consigna de la redacción", "maxWords": 0 }',
  gaps:      '{ "type": "gaps", "text": "El agua hierve a [100] grados y se congela a [0|cero]." }',
  table:     '{ "type": "table", "prompt": "Enunciado (opcional)", "colHeaders": ["Col1", "Col2"], "rowHeaders": ["Fila1", "Fila2"], "rows": [["c11", "c12"], ["c21", "c22"]] }',
  match:     '{ "type": "match", "prompt": "Enunciado", "pairs": [{ "left": "A", "right": "1" }], "distractors": ["sobrante"] }',
  order:     '{ "type": "order", "prompt": "Enunciado", "items": ["Primero", "Segundo", "Tercero"] }'
};

// Construye el prompt completo a partir de las opciones del formulario.
// Todo el texto humano viene de i18n (claves ai.p.* y ai.hint.*), de modo que
// el prompt se genera en el idioma del profesor. Las formas JSON (TYPE_SPECS)
// se mantienen fijas porque sus claves son neutrales (type, prompt, answers…).
//   opts = { topic, level, lang, count, types: [ids permitidos], extra }
export function buildPrompt(opts = {}) {
  const { topic = '', level = '', lang = 'español', count = 8, extra = '' } = opts;
  const types = (opts.types && opts.types.length ? opts.types : AI_TYPES)
    .filter(id => AI_TYPES.includes(id));

  const typeList = types.map(id => `  - "${id}": ${t('ai.hint.' + id)}`).join('\n');
  const specList = types.map(id => `  ${TYPE_SPECS[id]}`).join('\n');

  const lines = [
    t('ai.p.role'),
    '',
    '{',
    `  "title": "${t('ai.p.skTitle')}",`,
    `  "instructions": "${t('ai.p.skInstr')}",`,
    `  "items": [ ${t('ai.p.skItems')} ]`,
    '}',
    '',
    t('ai.p.typesIntro'),
    typeList,
    '',
    t('ai.p.shapesIntro'),
    specList,
    '',
    t('ai.p.rules'),
    '',
    '== ' + t('ai.p.assignment') + ' ==',
    topic ? `${t('ai.p.topic')}: ${topic}` : t('ai.p.topicFree'),
    level ? `${t('ai.p.level')}: ${level}` : '',
    `${t('ai.p.lang')}: ${lang}`,
    `${t('ai.p.count')}: ${count}`,
    t('ai.p.startHint'),
    extra ? `${t('ai.p.extra')}: ${extra}` : ''
  ].filter(l => l !== '');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 2) Lectura y validación de la respuesta de la IA
// ---------------------------------------------------------------------------

// Extrae el primer objeto JSON del texto pegado, tolerando ```json … ```,
// texto explicativo alrededor y comas finales sobrantes.
function extractJson(raw) {
  let s = String(raw || '').trim();
  // Quitar vallas de código ```json … ```
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  // Recortar al primer { … último }
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first === -1 || last === -1 || last < first) return null;
  let candidate = s.slice(first, last + 1);
  // Tolerar comas finales antes de } o ]
  candidate = candidate.replace(/,(\s*[}\]])/g, '$1');
  try {
    const parsed = JSON.parse(candidate);
    // Si el JSON “vale” pero contenía LaTeX con escapes JSON válidos (\f, \r,
    // \t, \b, \n…), el parser ya habrá corrompido el contenido. En ese caso
    // reparamos igualmente y volvemos a parsear.
    if (!hasSuspiciousControlChars(parsed)) return parsed;
  } catch { /* continúa */ }
  // Las IAs a veces generan LaTeX sin doblar barras dentro de strings JSON.
  // Eso puede romper el parseo (\(, \[) o, peor, colarse como escapes JSON
  // válidos (\frac → \f + "rac"). Reparamos string a string.
  candidate = repairJsonStringEscapes(candidate);
  try { return JSON.parse(candidate); } catch { return null; }
}

function repairJsonStringEscapes(candidate) {
  return candidate.replace(/"((?:[^"\\]|\\.)*)"/gs, (_, inner) =>
    '"' + repairJsonStringInner(inner) + '"'
  );
}

function repairJsonStringInner(inner) {
  let out = '';
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch !== '\\') { out += ch; continue; }
    const next = inner[i + 1];
    if (next == null) { out += '\\\\'; continue; }
    if (next === '"' || next === '\\' || next === '/') {
      out += '\\' + next;
      i++;
      continue;
    }
    if (next === 'u' && /^[0-9a-fA-F]{4}$/.test(inner.slice(i + 2, i + 6))) {
      out += inner.slice(i, i + 6);
      i += 5;
      continue;
    }
    // Mantener escapes JSON reales (\n, \t, …) salvo que claramente formen
    // parte de un comando LaTeX como \frac, \text, \bar, \nabla o \right.
    if ('bfnrt'.includes(next) && !/[A-Za-z]/.test(inner[i + 2] || '')) {
      out += '\\' + next;
      i++;
      continue;
    }
    out += '\\\\' + next;
    i++;
  }
  return out;
}

function hasSuspiciousControlChars(value) {
  if (typeof value === 'string') return /[\u0000-\u001f]/.test(value);
  if (Array.isArray(value)) return value.some(hasSuspiciousControlChars);
  if (value && typeof value === 'object') return Object.values(value).some(hasSuspiciousControlChars);
  return false;
}

// Valida el JSON intermedio. Devuelve { ok, data, errors[] }.
// `data` queda normalizado (items filtrados/saneados) cuando ok es true.
export function parseImport(raw) {
  const errors = [];
  const obj = extractJson(raw);
  if (!obj || typeof obj !== 'object') {
    return { ok: false, data: null, errors: ['No se ha encontrado un JSON válido en el texto pegado.'] };
  }
  if (!Array.isArray(obj.items) || obj.items.length === 0) {
    return { ok: false, data: null, errors: ['El JSON no contiene una lista «items» con elementos.'] };
  }

  const items = [];
  obj.items.forEach((it, i) => {
    const where = `Item ${i + 1}`;
    if (!it || typeof it !== 'object' || !it.type) {
      errors.push(`${where}: sin «type».`); return;
    }
    if (!AI_TYPES.includes(it.type)) {
      errors.push(`${where}: tipo desconocido «${it.type}».`); return;
    }
    const e = validateItem(it, where);
    if (e.length) { errors.push(...e); return; }
    items.push(it);
  });

  if (!items.length) {
    return { ok: false, data: null, errors: errors.length ? errors : ['Ningún item válido.'] };
  }
  // Los errores de items concretos se devuelven como avisos: se importa el resto.
  return {
    ok: true,
    data: { title: String(obj.title || ''), instructions: String(obj.instructions || ''), items },
    errors
  };
}

function isStrArr(a) { return Array.isArray(a) && a.length > 0 && a.every(x => typeof x === 'string'); }

// Comprueba los campos obligatorios de cada tipo. Devuelve lista de errores.
function validateItem(it, where) {
  const errs = [];
  const need = (cond, msg) => { if (!cond) errs.push(`${where}: ${msg}`); };
  switch (it.type) {
    case 'label':
      need(typeof it.text === 'string' && it.text.trim(), 'falta «text».'); break;
    case 'text':
      need(isStrArr(it.answers), 'falta «answers» (lista de respuestas).'); break;
    case 'formula':
      need(isStrArr(it.answers), 'falta «answers» (lista de fórmulas LaTeX).'); break;
    case 'number':
      need(it.answer !== undefined && it.answer !== '' && Number.isFinite(Number(it.answer)), 'falta «answer» numérico.'); break;
    case 'truefalse':
      need(typeof it.correct === 'boolean', '«correct» debe ser true o false.'); break;
    case 'single':
    case 'select':
      need(isStrArr(it.options) && it.options.length >= 2, 'necesita al menos 2 «options».');
      need(Number.isInteger(it.correct) && it.correct >= 0 && it.correct < (it.options || []).length, '«correct» fuera de rango.');
      break;
    case 'multi':
      need(isStrArr(it.options) && it.options.length >= 2, 'necesita al menos 2 «options».');
      need(Array.isArray(it.correct) && it.correct.length > 0 && it.correct.every(c => Number.isInteger(c) && c >= 0 && c < (it.options || []).length), '«correct» debe ser una lista de índices válidos.');
      break;
    case 'essay':
      need(typeof it.prompt === 'string' && it.prompt.trim(), 'falta «prompt».'); break;
    case 'gaps':
      need(typeof it.text === 'string' && /\[[^\]]*\]/.test(it.text), '«text» debe contener al menos un hueco entre corchetes.'); break;
    case 'order':
      need(isStrArr(it.items) && it.items.length >= 2, 'necesita al menos 2 «items».'); break;
    case 'match':
      need(Array.isArray(it.pairs) && it.pairs.length >= 1 && it.pairs.every(p => p && typeof p.left === 'string' && typeof p.right === 'string'), 'necesita «pairs» con left/right.'); break;
    case 'table':
      need(isStrArr(it.colHeaders), 'falta «colHeaders».');
      need(Array.isArray(it.rows) && it.rows.length > 0 && it.rows.every(r => Array.isArray(r)), 'falta «rows» (matriz de respuestas).');
      break;
  }
  return errs;
}

// ---------------------------------------------------------------------------
// 3) Mapeo a config de OWS + auto-layout
// ---------------------------------------------------------------------------

// Convierte un item del JSON en uno o varios «bloques» de campo OWS. Cada bloque
// es { type, config, height (fracción de página), width, x? } sin posición Y:
// el layout la asigna después. Los tipos con enunciado propio generan además un
// bloque «label» con el texto de la pregunta, ya que en OWS los campos de
// respuesta no muestran un enunciado por sí mismos.
function itemToBlocks(it) {
  const blocks = [];
  const prompt = typeof it.prompt === 'string' ? it.prompt.trim() : '';
  // El enunciado se marca «tight» para que su campo de respuesta quede pegado
  // debajo (y la separación grande se reserve entre preguntas distintas).
  const addPrompt = () => { if (prompt) { const b = labelBlock(prompt, { bold: true }); b.tight = true; blocks.push(b); } };

  switch (it.type) {
    case 'label':
      blocks.push(labelBlock(it.text, { bold: looksLikeHeading(it.text) }));
      break;
    case 'text':
      addPrompt();
      blocks.push({ type: 'text', width: 0.5, height: 0.05, config: { answers: it.answers.map(String), ignoreCase: true, ignoreAccents: true, collapseSpaces: true } });
      break;
    case 'formula':
      addPrompt();
      blocks.push({ type: 'formula', width: 0.5, height: 0.06, config: { answers: it.answers.map(String) } });
      break;
    case 'number':
      addPrompt();
      blocks.push({ type: 'number', width: 0.3, height: 0.05, config: { answer: String(it.answer), tolerance: Number(it.tolerance) || 0 } });
      break;
    case 'truefalse':
      addPrompt();
      blocks.push({ type: 'truefalse', width: 0.4, height: 0.06, config: { correct: it.correct === true, labels: ['Verdadero', 'Falso'] } });
      break;
    case 'single':
      addPrompt();
      blocks.push({ type: 'single', width: 0.7, height: optionsHeight(it.options.length), config: { options: it.options.map(String), correct: it.correct | 0 } });
      break;
    case 'select':
      addPrompt();
      blocks.push({ type: 'select', width: 0.4, height: 0.05, config: { options: it.options.map(String), correct: it.correct | 0 } });
      break;
    case 'multi':
      addPrompt();
      blocks.push({ type: 'multi', width: 0.7, height: optionsHeight(it.options.length), config: { options: it.options.map(String), correct: it.correct.slice().sort((a, b) => a - b), partial: false } });
      break;
    case 'essay':
      blocks.push({ type: 'essay', width: 0.84, height: 0.18, config: { prompt, rows: 4, maxWords: Number(it.maxWords) || 0, showFormula: true } });
      break;
    case 'gaps':
      addPrompt();
      blocks.push({ type: 'gaps', width: 0.84, height: gapsHeight(it.text), config: { text: String(it.text), ignoreCase: true, ignoreAccents: true, collapseSpaces: true } });
      break;
    case 'order':
      addPrompt();
      blocks.push({ type: 'order', width: 0.5, height: 0.02 + it.items.length * 0.03, config: { items: it.items.map(String) } });
      break;
    case 'match':
      addPrompt();
      blocks.push({ type: 'match', width: 0.7, height: 0.03 + it.pairs.length * 0.04, config: { pairs: it.pairs.map(p => ({ left: String(p.left), right: String(p.right) })), distractors: Array.isArray(it.distractors) ? it.distractors.map(String) : [] } });
      break;
    case 'table': {
      addPrompt();
      const rows = it.rows.length;
      const cols = it.colHeaders.length;
      const cfg = normalizeTableConfig({
        rows, cols,
        showColHeaders: true,
        colHeaders: it.colHeaders.map(String),
        rowHeaders: Array.isArray(it.rowHeaders) ? it.rowHeaders.map(String) : Array.from({ length: rows }, () => ''),
        cellAnswers: it.rows.map(r => Array.from({ length: cols }, (_, c) => [String(r[c] ?? '')]))
      });
      blocks.push({ type: 'table', width: 0.84, height: 0.05 + (rows + 1) * 0.038, config: cfg });
      break;
    }
  }
  return blocks;
}

function labelBlock(text, { bold = false } = {}) {
  const width = 0.84;
  return { type: 'label', width, height: labelHeight(text, width), config: { text: String(text), color: '#1d2c42', bold, align: 'left' } };
}

// Heurísticas de altura (en fracción de página A4). Las cajas deben dar cabida a
// TODAS las líneas del texto: si se quedan cortas, el visor recorta lo que sobra
// (la 2ª línea de un enunciado largo desaparecería). Calibradas para no solapar
// y dejar poco hueco; el profesor reajusta luego con total libertad.
const LINE_H = 0.02; // altura aproximada de una línea de texto, en fracción de alto

// Estima las líneas que ocupará un texto en una caja de ancho `width` (fracción)
// y devuelve la altura necesaria. ~58 caracteres por línea a ancho completo.
function labelHeight(text, width = 0.84) {
  const cpl = Math.max(18, Math.round(width * 58));
  const lines = Math.max(1, Math.ceil(String(text).length / cpl));
  return 0.012 + lines * LINE_H;
}
function optionsHeight(n) { return 0.018 + n * 0.024; }
function gapsHeight(text) {
  const lines = Math.max(1, Math.ceil(String(text).length / 70));
  return 0.03 + lines * 0.028;
}
function looksLikeHeading(text) {
  const s = String(text).trim();
  return /^#{1,6}\s/.test(s) || (s.length < 60 && !/[.;:]$/.test(s));
}

// Reparte los bloques en una columna centrada, paginando cuando se llena el alto.
// Devuelve un array de páginas; cada página es un array de campos OWS listos
// ({ id, type, rect, points, fontScale, config }). pointsFor decide si puntúa.
export function layoutFields(items) {
  const MARGIN_X = 0.08, MARGIN_TOP = 0.04, MARGIN_BOTTOM = 0.04, GAP = 0.013;
  const usableBottom = 1 - MARGIN_BOTTOM;

  const blocks = [];
  items.forEach(it => blocks.push(...itemToBlocks(it)));

  const pages = [];
  let current = [];
  let y = MARGIN_TOP;

  for (const b of blocks) {
    // Si un bloque no cabe en lo que queda de página, abre una nueva (salvo que
    // la página esté vacía: entonces lo metemos igual para no perderlo).
    if (current.length && y + b.height > usableBottom) {
      pages.push(current);
      current = [];
      y = MARGIN_TOP;
    }
    const w = Math.min(b.width, 1 - 2 * MARGIN_X);
    current.push({
      id: uid('f'),
      type: b.type,
      rect: { x: MARGIN_X, y, w, h: b.height },
      points: isDecor(b.type) ? 0 : 1,
      fontScale: 1,
      config: b.config
    });
    // Tras un enunciado «tight», poco hueco (pega el campo); si no, hueco normal.
    y += b.height + (b.tight ? 0.006 : GAP);
  }
  if (current.length) pages.push(current);
  return pages.length ? pages : [[]];
}

function isDecor(type) { return type === 'label'; }
