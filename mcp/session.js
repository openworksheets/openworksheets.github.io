// Estado de la ficha que se está construyendo y todas las operaciones sobre
// ella. Hay una sola ficha viva por servidor: el flujo es «abre un documento,
// coloca campos, previsualiza, guarda», y trabajar con varias a la vez solo
// añadiría confusión al modelo sin ganar nada.

const fs = require('fs');
const path = require('path');
const { workbench, viewer, hasApp } = require('./browser');
const { makeZip } = require('./zip');
const { isType, buildField } = require('./fieldspec');

const FORMAT = 'workpdf-ficha';
const FORMAT_VERSION = 1;

// Rectángulos por debajo de esto son inclicables en la práctica.
const MIN_W = 0.01;
const MIN_H = 0.012;

let state = null;

function reset() {
  state = null;
}

function newManifest(title) {
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    id: 'wpf' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    title: title || '',
    author: '',
    instructions: '',
    lang: '',
    settings: {
      showScore: true,
      showCorrection: true,
      shuffle: false,
      maxAttempts: 0,
      keepFullscreen: false,
      focusMode: 'free',
      focusMaxIncidents: 0,
      encryptSubmissions: true,
      fontFamily: 'atkinson',
      scorm: { statusMode: 'score', masteryScore: 50 }
    },
    access: { desde: '', hasta: '', autoEntrega: false, tiempoLimite: 0, password: '' },
    pages: []
  };
}

function require_() {
  if (!state) throw new Error('No hay ningún documento abierto: usa open_document primero.');
  return state;
}

function uid(pre) {
  return pre + Math.random().toString(36).slice(2, 10) + (seq++).toString(36);
}
let seq = 0;

function dataUrlToBuffer(dataUrl) {
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
}

// ---------------------------------------------------------------------------
// Abrir documento
// ---------------------------------------------------------------------------

async function openDocument(file) {
  const abs = path.resolve(file.replace(/^~/, process.env.HOME || '~'));
  if (!fs.existsSync(abs)) throw new Error(`No existe el archivo: ${abs}`);
  const buf = fs.readFileSync(abs);
  const ext = path.extname(abs).toLowerCase();
  const wb = await workbench();

  state = {
    source: abs,
    manifest: newManifest(path.basename(abs, ext).replace(/[-_]+/g, ' ').trim()),
    files: new Map(),
    pages: []   // { image, w, h, dataUrl, text, rules }
  };

  if (ext === '.pdf') {
    const { pages } = await wb.evaluate(b64 => window.owsOpenPdf(b64), buf.toString('base64'));
    for (let n = 1; n <= pages; n++) {
      const r = await wb.evaluate(i => window.owsRenderPage(i), n);
      addPage(r, n);
    }
  } else if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) {
    const mime = ext === '.jpg' ? 'jpeg' : ext.slice(1);
    const dataUrl = `data:image/${mime};base64,${buf.toString('base64')}`;
    const { w, h, rules } = await wb.evaluate(u => window.owsLoadImage(u), dataUrl);
    addPage({ w, h, dataUrl, ext: ext.slice(1), text: [], rules }, 1);
  } else {
    throw new Error(`Formato no admitido: ${ext}. Se aceptan PDF e imágenes.`);
  }

  return {
    title: state.manifest.title,
    source: abs,
    pages: state.pages.map((p, i) => ({
      page: i + 1, w: p.w, h: p.h,
      textItems: p.text.length,
      horizontalRules: p.rules.length,
      hasTextLayer: p.text.length > 0
    }))
  };
}

function addPage(r, n) {
  const image = `pages/page-${n}.${r.ext}`;
  state.files.set(image, dataUrlToBuffer(r.dataUrl));
  state.manifest.pages.push({ image, w: r.w, h: r.h, fields: [] });
  state.pages.push({ image, w: r.w, h: r.h, dataUrl: r.dataUrl, text: r.text || [], rules: r.rules || [] });
}

// Tamaños de página, en píxeles, con el mismo ancho que usa el editor al
// rasterizar un PDF para que todo case.
const PAGE_SIZES = {
  a4: { w: 1600, h: 2263 },
  a4h: { w: 2263, h: 1600 },   // apaisada
  letter: { w: 1600, h: 2071 }
};

// Ficha que no parte de ningún documento: hojas en blanco sobre las que colocar
// las preguntas. Lo demás funciona igual que con un PDF.
async function createWorksheet({ title = '', pages = 1, size = 'a4', instructions = '' } = {}) {
  const medida = PAGE_SIZES[String(size).toLowerCase()] || PAGE_SIZES.a4;
  const cuantas = Math.max(1, Math.min(20, parseInt(pages, 10) || 1));
  const wb = await workbench();

  state = { source: '', manifest: newManifest(title), files: new Map(), pages: [] };
  if (instructions) state.manifest.instructions = String(instructions);

  for (let n = 1; n <= cuantas; n++) {
    const r = await wb.evaluate((w, h) => window.owsBlankPage(w, h, '#ffffff'), medida.w, medida.h);
    addPage({ ...r, text: [], rules: [] }, n);
  }
  return {
    title: state.manifest.title,
    pages: state.pages.map((p, i) => ({ page: i + 1, w: p.w, h: p.h })),
    aviso: 'Ficha en blanco. Usa add_questions para que las preguntas se coloquen solas, o place_fields si prefieres indicar tú las coordenadas.'
  };
}

// Añade una página más en blanco, del tamaño de la última.
async function addBlankPage() {
  const st = require_();
  const ultima = st.pages[st.pages.length - 1];
  const wb = await workbench();
  const r = await wb.evaluate((w, h) => window.owsBlankPage(w, h, '#ffffff'), ultima.w, ultima.h);
  addPage({ ...r, text: [], rules: [] }, st.pages.length + 1);
  return st.pages.length;
}

// ---------------------------------------------------------------------------
// Leer el documento
// ---------------------------------------------------------------------------

// Agrupa los fragmentos de texto en líneas legibles, conservando el rectángulo
// de cada uno. pdf.js entrega trozos sueltos (a veces palabra a palabra), que
// por separado no dicen nada al modelo.
function lines(items) {
  const out = [];
  for (const it of [...items].sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x)) {
    const line = out.find(l => Math.abs(l.rect.y - it.rect.y) < it.rect.h * 0.6);
    if (line) {
      line.parts.push(it);
      const x0 = Math.min(line.rect.x, it.rect.x);
      const x1 = Math.max(line.rect.x + line.rect.w, it.rect.x + it.rect.w);
      line.rect = { x: x0, y: Math.min(line.rect.y, it.rect.y), w: x1 - x0, h: Math.max(line.rect.h, it.rect.h) };
    } else {
      out.push({ parts: [it], rect: { ...it.rect } });
    }
  }
  return out.map(l => {
    const parts = l.parts.sort((a, b) => a.rect.x - b.rect.x);
    // Entre dos fragmentos separados horizontalmente (columnas de una tabla,
    // «Nombre:» y «Fecha:» en la misma línea) se marca el corte con « | »: sin
    // él, el texto sale pegado y se lee como una sola cosa.
    let text = '';
    parts.forEach((p, i) => {
      const prev = parts[i - 1];
      if (prev) {
        const hueco = p.rect.x - (prev.rect.x + prev.rect.w);
        text += hueco > 0.012 ? ' | ' : '';
      }
      text += p.str;
    });
    const res = { text: text.replace(/\s+/g, ' ').trim(), rect: round4(l.rect) };
    if (parts.length > 1) res.parts = parts.map(p => ({ text: p.str.trim(), rect: p.rect })).filter(p => p.text);
    return res;
  }).filter(l => l.text);
}

// Huecos escritos con guiones bajos o puntos suspensivos dentro de una línea.
// Se calcula su rectángulo repartiendo el ancho de la línea entre sus
// caracteres: es aproximado, pero suficiente para colocar el campo encima y
// afinarlo luego con la vista previa.
function underscoreGaps(items) {
  const gaps = [];
  for (const it of items) {
    const re = /[_.·…]{4,}/g;
    let m;
    while ((m = re.exec(it.str))) {
      const per = it.rect.w / it.str.length;
      gaps.push(round4({
        x: it.rect.x + per * m.index,
        y: it.rect.y,
        w: per * m[0].length,
        h: it.rect.h
      }));
    }
  }
  return gaps;
}

function readLayout(n, opts = {}) {
  const p = page(n);
  const res = {
    page: n,
    size: { w: p.w, h: p.h },
    hasTextLayer: p.text.length > 0,
    note: 'Todos los rectángulos van en fracciones de la página (0–1), con el origen arriba a la izquierda: es el mismo sistema que usa place_fields.',
    lines: lines(p.text)
  };
  if (opts.raw) res.items = p.text.map(it => ({ text: it.str, rect: it.rect }));
  res.gapCandidates = {
    underscores: underscoreGaps(p.text),
    horizontalRules: p.rules
  };
  if (!res.hasTextLayer) {
    res.warning = 'Esta página no tiene capa de texto (probablemente es un escaneo). Usa preview_page con grid:true para situar los campos a ojo y corrige mirando la vista previa.';
  }
  return res;
}

function page(n) {
  const st = require_();
  const p = st.pages[n - 1];
  if (!p) throw new Error(`La página ${n} no existe (el documento tiene ${st.pages.length}).`);
  return p;
}

// ---------------------------------------------------------------------------
// Campos
// ---------------------------------------------------------------------------

function round4(r) {
  const f = v => Math.round(v * 10000) / 10000;
  return { x: f(r.x), y: f(r.y), w: f(r.w), h: f(r.h) };
}

function overlap(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / Math.min(a.w * a.h, b.w * b.h);
}

function checkRect(rect, pageNo, type) {
  const r = rect || {};
  for (const k of ['x', 'y', 'w', 'h']) {
    if (!Number.isFinite(r[k])) throw new Error(`rect.${k} no es un número.`);
  }
  if (r.w < MIN_W || r.h < MIN_H) {
    throw new Error(`El campo es demasiado pequeño (w=${r.w}, h=${r.h}). Mínimo w=${MIN_W}, h=${MIN_H}.`);
  }
  if (r.x < 0 || r.y < 0 || r.x + r.w > 1.001 || r.y + r.h > 1.001) {
    throw new Error(`El campo se sale de la página: x=${r.x} y=${r.y} w=${r.w} h=${r.h}. Las coordenadas van de 0 a 1.`);
  }
  const warnings = [];
  const p = page(pageNo);
  for (const f of state.manifest.pages[pageNo - 1].fields) {
    if (overlap(r, f.rect) > 0.25) warnings.push(`se solapa con el campo ${f.id} (${f.type})`);
  }
  // Un campo de respuesta encima de texto impreso lo deja ilegible. El aviso no
  // bloquea: a veces es justo lo que se busca (tapar la solución impresa).
  if (type !== 'cover' && type !== 'label') {
    for (const it of p.text) {
      if (overlap(r, it.rect) > 0.45) {
        warnings.push(`tapa el texto impreso «${it.str.trim().slice(0, 40)}»`);
        break;
      }
    }
  }
  return warnings;
}

// «Huecos en documento» y «Casillas» colocan sus cajas sobre la página; el
// rectángulo del campo es solo un ancla que no se ve. Si no viene, se deduce
// de las cajas para no obligar a inventarlo.
const BOXED = { textboxes: 'boxes', checkbox: 'boxes', dragdrop: 'zones' };

function inferRect(spec) {
  if (spec.rect) return spec.rect;
  const cajas = Array.isArray(spec[BOXED[spec.type]]) ? spec[BOXED[spec.type]] : [];
  const rects = cajas.map(c => c?.rect).filter(r => r && Number.isFinite(r.x));
  if (!rects.length) return spec.rect;
  const x = Math.min(...rects.map(r => r.x));
  const y = Math.min(...rects.map(r => r.y));
  const x2 = Math.max(...rects.map(r => r.x + r.w));
  const y2 = Math.max(...rects.map(r => r.y + r.h));
  return { x, y, w: Math.max(MIN_W, x2 - x), h: Math.max(MIN_H, y2 - y) };
}

function placeFields(specs) {
  const st = require_();
  if (!Array.isArray(specs) || !specs.length) throw new Error('No se ha indicado ningún campo.');
  // Se valida el lote entero antes de tocar la ficha: si un campo viene mal, es
  // preferible no aceptar ninguno a dejar la ficha a medio construir.
  const preparados = specs.map((spec, i) => {
    const pageNo = parseInt(spec.page, 10) || 1;
    const dónde = ` (campo ${i + 1} de ${specs.length})`;
    if (!st.manifest.pages[pageNo - 1]) throw new Error(`La página ${pageNo} no existe${dónde}.`);
    if (!isType(spec.type)) throw new Error(`Tipo de campo desconocido: "${spec.type}"${dónde}.`);
    const rect = round4(inferRect(spec) || {});
    try {
      checkRect(rect, pageNo, spec.type);
      // Los tipos con geometría múltiple llevan, además del rectángulo del
      // campo, el de cada caja: se validan igual, o el campo saldría roto.
      const clave = BOXED[spec.type];
      if (clave) {
        const cajas = Array.isArray(spec[clave]) ? spec[clave] : [];
        if (!cajas.length) throw new Error(`Este tipo necesita al menos un elemento en «${clave}».`);
        cajas.forEach((c, k) => {
          if (!c || !c.rect) throw new Error(`El elemento ${k + 1} de «${clave}» no tiene rect.`);
          checkRect(round4(c.rect), pageNo, spec.type + '-box');
        });
      }
    } catch (e) { throw new Error(e.message.replace(/\.$/, '') + dónde + '.'); }
    return { spec, pageNo, rect };
  });
  const results = [];
  for (const { spec, pageNo, rect } of preparados) {
    // Los avisos se recalculan al colocar: cada campo ve a los ya puestos.
    const warnings = checkRect(rect, pageNo, spec.type);
    const { field, warnings: w2 } = buildField({ ...spec, rect }, uid('f'));
    // Las zonas de destino se revisan una a una: sus avisos también le importan
    // a quien coloca los campos, no solo los de la bandeja.
    const wz = [];
    const cajas = field.config.zones || field.config.boxes || [];
    cajas.forEach((c, k) => {
      if (!c.rect) return;
      c.rect = round4(c.rect);
      checkRect(c.rect, pageNo, field.type + '-box')
        .forEach(w => wz.push(`${field.config.zones ? 'zona' : 'casilla'} ${k + 1}${c.answers?.[0] ? ` (${c.answers[0]})` : ''}: ${w}`));
    });
    st.manifest.pages[pageNo - 1].fields.push(field);
    results.push({
      id: field.id, page: pageNo, type: field.type, rect, points: field.points,
      warnings: [...warnings, ...w2, ...wz],
      ...(field.config.zones ? { zones: field.config.zones.map(z => ({ id: z.id, rect: z.rect, answers: z.answers })) } : {}),
      ...(field.config.boxes ? { boxes: field.config.boxes.map(b => ({ id: b.id, rect: b.rect, answers: b.answers })) } : {})
    });
  }
  return { placed: results, totalFields: countFields(), totalPoints: totalPoints() };
}

function findField(id) {
  const st = require_();
  for (let i = 0; i < st.manifest.pages.length; i++) {
    const f = st.manifest.pages[i].fields.find(f => f.id === id);
    if (f) return { field: f, page: i + 1 };
  }
  throw new Error(`No hay ningún campo con id "${id}".`);
}

function adjustField(id, patch) {
  const { field, page: pageNo } = findField(id);
  let warnings = [];
  if (patch.rect) {
    const rect = round4({ ...field.rect, ...patch.rect });
    const others = state.manifest.pages[pageNo - 1].fields;
    const idx = others.indexOf(field);
    others.splice(idx, 1);                       // no compararse consigo mismo
    try { warnings = checkRect(rect, pageNo, field.type); }
    finally { others.splice(idx, 0, field); }
    field.rect = rect;
  }
  if (patch.points != null) field.points = Number(patch.points);
  if (patch.type && patch.type !== field.type) throw new Error('No se puede cambiar el tipo: borra el campo y crea otro.');
  // El resto de claves (answers, options, correct…) se reinterpretan con el
  // constructor del tipo, para no dejar el config a medias.
  const semantic = { ...patch };
  delete semantic.rect; delete semantic.points; delete semantic.type;
  if (Object.keys(semantic).length) {
    const merged = { type: field.type, rect: field.rect, points: field.points, ...fromConfig(field), ...semantic };
    const rebuilt = buildField(merged, field.id);
    field.config = rebuilt.field.config;
    warnings = [...warnings, ...rebuilt.warnings];
  }
  return { id, page: pageNo, type: field.type, rect: field.rect, points: field.points, config: field.config, warnings };
}

// Los campos guardan su config ya expandida; para reconstruirla al editar basta
// con volver a pasarla por el constructor, que ignora lo que no le sirve.
function fromConfig(field) {
  return { ...field.config };
}

function removeFields(ids) {
  const st = require_();
  const removed = [];
  for (const id of ids) {
    for (const p of st.manifest.pages) {
      const i = p.fields.findIndex(f => f.id === id);
      if (i >= 0) { p.fields.splice(i, 1); removed.push(id); break; }
    }
  }
  return { removed, totalFields: countFields() };
}

function listFields(n) {
  const st = require_();
  const pages = n ? [st.manifest.pages[n - 1]] : st.manifest.pages;
  const out = [];
  pages.forEach((p, i) => {
    const pageNo = n || i + 1;
    for (const f of p.fields) {
      out.push({ id: f.id, page: pageNo, type: f.type, rect: f.rect, points: f.points, config: f.config });
    }
  });
  return { fields: out, totalFields: countFields(), totalPoints: totalPoints() };
}

function countFields() {
  return state.manifest.pages.reduce((n, p) => n + p.fields.length, 0);
}

function totalPoints() {
  return state.manifest.pages.reduce((n, p) =>
    n + p.fields.reduce((m, f) => m + (f.noScore ? 0 : Number(f.points) || 0), 0), 0);
}

// ---------------------------------------------------------------------------
// Colocación automática
// ---------------------------------------------------------------------------
//
// Para las fichas que no parten de un documento no hay dónde encajar los campos:
// se apilan. Aquí se calcula ese apilado —enunciado, campo, separación, salto de
// página— y luego se colocan por la vía de siempre, con sus validaciones.

const MARGEN_X = 0.06;
const ANCHO = 1 - MARGEN_X * 2;
const MARGEN_ARRIBA = 0.05;
const MARGEN_ABAJO = 0.95;
const SEPARACION = 0.018;
const ALTO_LINEA = 0.019;          // una línea de texto de enunciado
const CARACTERES_POR_LINEA = 95;   // a lo ancho de la página, tamaño normal

function altoTexto(texto, ancho = ANCHO) {
  const porLinea = Math.max(20, Math.round(CARACTERES_POR_LINEA * (ancho / ANCHO)));
  const lineas = Math.max(1, Math.ceil(String(texto || '').length / porLinea));
  return lineas * ALTO_LINEA;
}

// Alto que necesita cada tipo de campo, ya sin contar el enunciado.
function altoCampo(spec) {
  const n = (lista, def = 0) => (Array.isArray(spec[lista]) ? spec[lista].length : def);
  switch (spec.type) {
    case 'essay': return Math.max(0.1, (parseInt(spec.rows, 10) || 4) * 0.028);
    // Las alturas salen de medir los campos ya renderizados en el visor: con
    // valores «por si acaso» la ficha queda llena de huecos.
    case 'single':
    case 'multi': return Math.max(0.05, n('options', 3) * 0.017 + 0.016);
    case 'truefalse': return 0.045;
    case 'select': return 0.04;
    case 'record': return 0.09;
    case 'formula': return 0.05;
    case 'gaps': return altoTexto(spec.text) + 0.03;
    case 'order': return Math.max(0.055, n('items', 3) * 0.024 + 0.01);
    case 'match': return Math.max(0.07, n('pairs', 2) * 0.032);
    case 'table': return 0.05 + (n('rows', 2) + 1) * 0.038;
    case 'label': return altoTexto(spec.text);
    case 'number': return 0.038;
    default: return 0.038;   // text y demás campos de una línea
  }
}

// Ancho del campo: los de una línea no necesitan toda la página.
function anchoCampo(spec) {
  if (['text', 'formula'].includes(spec.type)) return 0.5;
  if (spec.type === 'number' || spec.type === 'select') return 0.3;
  if (spec.type === 'truefalse') return 0.34;
  return ANCHO;
}

// Coloca una lista de preguntas descritas como en el prompt de «Crear con IA»:
// cada una con su enunciado y su respuesta, sin coordenadas.
async function addQuestions(items) {
  const st = require_();
  if (!Array.isArray(items) || !items.length) throw new Error('No se ha indicado ninguna pregunta.');

  // Se continúa por debajo de lo que ya haya en la última página.
  let pagina = st.manifest.pages.length;
  let y = MARGEN_ARRIBA;
  const ocupados = st.manifest.pages[pagina - 1]?.fields || [];
  if (ocupados.length) y = Math.max(...ocupados.map(f => f.rect.y + f.rect.h)) + SEPARACION * 2;

  const specs = [];
  for (const item of items) {
    if (!isType(item.type)) throw new Error(`Tipo de pregunta desconocido: "${item.type}".`);
    const enunciado = item.type === 'label' ? '' : String(item.prompt || '');
    const hEnunciado = enunciado ? altoTexto(enunciado) : 0;
    const hCampo = altoCampo(item);
    const total = hEnunciado + (enunciado ? 0.006 : 0) + hCampo;

    // Si no cabe entera, empieza en una página nueva (creándola si hace falta).
    if (y + total > MARGEN_ABAJO) {
      pagina += 1;
      if (pagina > st.manifest.pages.length) await addBlankPage();
      y = MARGEN_ARRIBA;
    }

    if (enunciado) {
      specs.push({ page: pagina, type: 'label', text: enunciado, bold: true,
                   rect: { x: MARGEN_X, y, w: ANCHO, h: hEnunciado } });
      y += hEnunciado + 0.006;
    }
    const { prompt, ...resto } = item;
    specs.push({ ...resto, page: pagina, rect: { x: MARGEN_X, y, w: anchoCampo(item), h: hCampo } });
    y += hCampo + SEPARACION;
  }

  const res = placeFields(specs);
  return {
    ...res,
    paginas: st.manifest.pages.length,
    aviso: 'Mira preview_page de cada página para comprobar cómo ha quedado; con adjust_field puedes recolocar lo que no encaje.'
  };
}

// ---------------------------------------------------------------------------
// Vista previa y guardado
// ---------------------------------------------------------------------------

// Mime de los archivos incrustados en el paquete, para reconstruirlos como
// data: URL dentro del visor.
const MIME_EXT = {
  webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', mp4: 'video/mp4', webm: 'video/webm'
};

function fileDataUrl(nombre) {
  const buf = state.files.get(nombre);
  if (!buf) return null;
  const ext = path.extname(nombre).slice(1).toLowerCase();
  return `data:${MIME_EXT[ext] || 'application/octet-stream'};base64,${buf.toString('base64')}`;
}

// Archivos que necesita una página para verse entera: su imagen de fondo y lo
// que referencien sus campos (imágenes, audio, vídeo).
function pageFiles(p, mp) {
  const out = { [p.image]: p.dataUrl };
  const añadir = nombre => {
    if (!nombre || out[nombre]) return;
    const url = fileDataUrl(nombre);
    if (url) out[nombre] = url;
  };
  añadir(mp.bgFile);
  for (const f of mp.fields) añadir(f.config?.src);
  return out;
}

function legendOf(fields) {
  return fields.map((f, i) => `${i + 1}. ${f.type} (${f.id}) — ${f.noScore ? 'sin nota' : f.points + ' pt'}`);
}

// Vista previa: la ficha montada con el visor real del alumnado (js/player.js)
// y capturada tal cual. No se imita ningún campo —eso es lo que hacía antes el
// banco de trabajo, y mentía: un campo de opciones no tapa todo su rectángulo,
// así que una solución impresa debajo seguía viéndose en la ficha aunque en la
// vista previa pareciera cubierta—. Encima solo van el contorno y el número de
// cada campo, para poder nombrarlos; con marks:false, ni eso.
async function preview(n, opts = {}) {
  const st = require_();
  const p = page(n);
  const mp = st.manifest.pages[n - 1];
  const legend = legendOf(mp.fields);
  const width = opts.width || 1100;

  if (hasApp()) {
    try {
      const v = await viewer();
      await v.setViewport(width + 80, 1400);
      const rect = await v.evaluate(
        (m, files, o) => window.owsRenderReal(m, files, o),
        { ...st.manifest, pages: [mp] }, pageFiles(p, mp),
        { width, grid: Boolean(opts.grid), marks: opts.marks !== false }
      );
      const base64 = await v.screenshot({
        x: Math.max(0, Math.floor(rect.x - 2)),
        y: Math.max(0, Math.floor(rect.y - 2)),
        width: Math.ceil(rect.width + 4),
        height: Math.ceil(rect.height + 4)
      });
      return { base64, legend, real: true };
    } catch (e) {
      // Si el visor falla se sigue con la vista previa dibujada: es peor, pero
      // vale más que quedarse sin ninguna.
      return { ...(await composed(n, opts)), legend, real: false, error: e.message };
    }
  }
  return { ...(await composed(n, opts)), legend, real: false };
}

// Vista previa de reserva: el fondo de la página con los campos dibujados
// encima. Solo se usa si falta la copia de la aplicación (carpeta app/) o si el
// visor real ha fallado.
async function composed(n, opts = {}) {
  const p = page(n);
  const fields = state.manifest.pages[n - 1].fields;
  const wb = await workbench();
  const dataUrl = await wb.evaluate(
    (bg, fs_, o) => window.owsCompose(bg, fs_, o),
    p.dataUrl,
    fields.map(f => ({ type: f.type, rect: f.rect, config: f.config })),
    { grid: Boolean(opts.grid), width: opts.width || 1100 }
  );
  return { base64: dataUrl.slice(dataUrl.indexOf(',') + 1) };
}

// Borra zonas de la página pintando sobre la propia imagen de fondo. El campo
// «cover» solo tapa en el visor: el contenido sigue dentro del paquete y se ve
// abriendo la imagen. Esto lo elimina de verdad, que es lo que hace falta para
// las soluciones impresas.
async function redact(n, areas, color) {
  const p = page(n);
  if (!Array.isArray(areas) || !areas.length) throw new Error('No se ha indicado ninguna zona que borrar.');
  const limpias = areas.map((a, i) => {
    const r = round4(a || {});
    for (const k of ['x', 'y', 'w', 'h']) {
      if (!Number.isFinite(r[k])) throw new Error(`La zona ${i + 1} no tiene ${k}.`);
    }
    if (r.x < 0 || r.y < 0 || r.x + r.w > 1.001 || r.y + r.h > 1.001) {
      throw new Error(`La zona ${i + 1} se sale de la página.`);
    }
    return r;
  });

  const wb = await workbench();
  const res = await wb.evaluate((u, a, c) => window.owsRedact(u, a, c), p.dataUrl, limpias, color || '#ffffff');

  // La imagen cambia de contenido pero conserva su nombre dentro del paquete.
  state.files.set(p.image, dataUrlToBuffer(res.dataUrl));
  p.dataUrl = res.dataUrl;
  // El texto tapado ya no está en la página: se descarta también de lo leído,
  // para que no se proponga como enunciado ni como candidato a hueco.
  const dentro = it => limpias.some(a =>
    it.rect.x + it.rect.w / 2 >= a.x && it.rect.x + it.rect.w / 2 <= a.x + a.w &&
    it.rect.y + it.rect.h / 2 >= a.y && it.rect.y + it.rect.h / 2 <= a.y + a.h);
  const antes = p.text.length;
  p.text = p.text.filter(it => !dentro(it));

  return { page: n, borradas: limpias.length, textoEliminado: antes - p.text.length, image: p.image };
}

function setMeta(meta = {}) {
  const st = require_();
  for (const k of ['title', 'author', 'instructions', 'lang']) {
    if (meta[k] != null) st.manifest[k] = String(meta[k]);
  }
  if (meta.settings) Object.assign(st.manifest.settings, meta.settings);
  return { title: st.manifest.title, author: st.manifest.author, instructions: st.manifest.instructions, lang: st.manifest.lang, settings: st.manifest.settings };
}

function save(file) {
  const st = require_();
  let abs = path.resolve(String(file).replace(/^~/, process.env.HOME || '~'));
  if (!/\.owpkg$/i.test(abs)) abs += '.owpkg';
  const entries = [{ name: 'manifest.json', data: Buffer.from(JSON.stringify(st.manifest, null, 2), 'utf8') }];
  for (const [name, data] of st.files) entries.push({ name, data });
  fs.writeFileSync(abs, makeZip(entries));
  return {
    path: abs,
    pages: st.manifest.pages.length,
    fields: countFields(),
    points: totalPoints(),
    bytes: fs.statSync(abs).size
  };
}

module.exports = {
  openDocument, createWorksheet, addBlankPage, addQuestions,
  readLayout, placeFields, adjustField, removeFields,
  listFields, preview, redact, setMeta, save, reset
};
