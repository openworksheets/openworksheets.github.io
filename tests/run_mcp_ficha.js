// Prueba de extremo a extremo del servidor MCP (mcp/server.js): habla el
// protocolo por stdio como lo haría una IA, convierte un PDF en ficha, coloca
// campos usando lo que devuelve read_layout, previsualiza y guarda el .owpkg.
//
//   node tests/run_mcp_ficha.js [ruta-del-pdf]
//
// Sin argumento usa tests/test_doc.pdf, que no tiene huecos: en ese caso solo
// se comprueba el circuito completo (abrir, colocar, previsualizar, guardar).
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PDF = process.argv[2] || path.join(__dirname, 'test_doc.pdf');
const OUT = path.join(os.tmpdir(), 'ows-mcp-test');
fs.mkdirSync(OUT, { recursive: true });

// OWS_MCP_SERVER permite apuntar a una copia del servidor fuera del repositorio,
// que es como lo usará el profesorado: se descarga solo la carpeta mcp/.
const SERVER = process.env.OWS_MCP_SERVER || path.join(__dirname, '..', 'mcp', 'server.js');
const srv = spawn('node', [SERVER], { stdio: ['pipe', 'pipe', 'inherit'] });
let buf = '', id = 0;
const pend = new Map();
srv.stdout.on('data', d => {
  buf += d;
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
    if (!line.trim()) continue;
    const m = JSON.parse(line);
    const cb = pend.get(m.id);
    if (cb) { pend.delete(m.id); cb(m); }
  }
});
const rpc = (method, params) => new Promise(res => {
  const myId = ++id;
  pend.set(myId, res);
  srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: myId, method, params }) + '\n');
});
async function call(name, args) {
  const { result } = await rpc('tools/call', { name, arguments: args });
  const text = (result.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
  if (result.isError) throw new Error(text);
  const image = (result.content || []).find(c => c.type === 'image');
  let json = null;
  try { json = JSON.parse(text); } catch { /* la vista previa no devuelve JSON */ }
  return { text, json, image };
}

let fails = 0;
const crypto = require('crypto');
const check = (name, ok, extra) => {
  if (!ok) fails++;
  console.log(`${name}: ${ok ? 'OK' : 'MAL'}${extra ? ' — ' + extra : ''}`);
};

// mcp/ lleva su propia copia de pdf.js para poder descargarse sola (que es como
// la usa el profesorado). Esa copia debe ser la misma que la de la aplicación:
// si alguien actualiza vendor/ y se olvida de mcp/vendor/, el MCP generaría
// páginas distintas de las del editor.
function checkVendorCopies() {
  const hash = f => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
  for (const name of ['pdf.min.js', 'pdf.worker.min.js']) {
    const app = path.join(__dirname, '..', 'vendor', name);
    const mcp = path.join(__dirname, '..', 'mcp', 'vendor', name);
    if (!fs.existsSync(app) || !fs.existsSync(mcp)) return; // copia suelta del MCP
    check(`mcp/vendor/${name} coincide con vendor/`, hash(app) === hash(mcp));
  }
}

(async () => {
  checkVendorCopies();
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  check('initialize responde', init.result?.serverInfo?.name === 'openworksheets');
  srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  const tools = (await rpc('tools/list', {})).result.tools;
  check('lista de herramientas', tools.length === 10, tools.map(t => t.name).join(', '));

  const doc = (await call('open_document', { path: PDF })).json;
  check('abre el documento', doc.pages.length >= 1, `${doc.pages.length} página(s)`);

  // Los huecos de la página 1 (guiones bajos) se convierten en respuesta corta.
  const layout = (await call('read_layout', { page: 1 })).json;
  check('lee la página', Array.isArray(layout.lines));
  const huecos = layout.gapCandidates.underscores;
  console.log(`  huecos detectados en la página 1: ${huecos.length}`);

  const fields = huecos.slice(0, 5).map(g => ({
    page: 1, type: 'text', points: 1,
    rect: { x: g.x, y: g.y - 0.003, w: g.w, h: Math.max(0.018, g.h + 0.006) },
    answers: ['respuesta']
  }));
  // Siempre se coloca al menos un campo, aunque el PDF no tenga huecos.
  fields.push({ page: 1, type: 'truefalse', rect: { x: 0.06, y: 0.94, w: 0.26, h: 0.03 }, correct: true, points: 1 });

  const placed = (await call('place_fields', { fields })).json;
  check('coloca los campos', placed.placed.length === fields.length, `${placed.placed.length} campos, ${placed.totalPoints} puntos`);
  check('todos dentro de la página', placed.placed.every(p => p.rect.x + p.rect.w <= 1.001));

  // Un campo fuera de la página debe ser rechazado con un error legible.
  let rechazado = false;
  try { await call('place_fields', { fields: [{ page: 1, type: 'text', rect: { x: 0.9, y: 0.5, w: 0.5, h: 0.05 } }] }); }
  catch (e) { rechazado = /se sale de la página/.test(e.message); }
  check('rechaza un campo fuera de la página', rechazado);

  // «Arrastrar a zonas»: la bandeja y las zonas se validan por separado.
  const dd = (await call('place_fields', { fields: [{
    page: 1, type: 'dragdrop', points: 2,
    rect: { x: 0.55, y: 0.94, w: 0.4, h: 0.04 },
    zones: [
      { rect: { x: 0.06, y: 0.02, w: 0.12, h: 0.03 }, answers: ['uno'] },
      { rect: { x: 0.25, y: 0.02, w: 0.12, h: 0.03 }, answers: ['dos'] }
    ],
    distractors: ['tres']
  }] })).json;
  check('coloca «arrastrar a zonas»', dd.placed[0].zones?.length === 2,
    dd.placed[0].zones?.map(z => z.answers[0]).join(', '));

  let zonaMal = false;
  try {
    await call('place_fields', { fields: [{
      page: 1, type: 'dragdrop', rect: { x: 0.5, y: 0.5, w: 0.3, h: 0.04 },
      zones: [{ rect: { x: 0.9, y: 0.5, w: 0.3, h: 0.03 }, answers: ['x'] }]
    }] });
  } catch (e) { zonaMal = /se sale de la página/.test(e.message); }
  check('rechaza una zona fuera de la página', zonaMal);

  // Tipos con varias cajas: el rectángulo del campo se deduce de ellas.
  const tb = (await call('place_fields', { fields: [{
    page: 1, type: 'textboxes', points: 2,
    boxes: [
      { rect: { x: 0.06, y: 0.30, w: 0.12, h: 0.03 }, answers: ['uno'] },
      { rect: { x: 0.24, y: 0.30, w: 0.12, h: 0.03 }, answers: ['dos'] }
    ]
  }] })).json;
  check('coloca «huecos en documento» sin rect propio',
    tb.placed[0].boxes?.length === 2 && tb.placed[0].rect.x === 0.06,
    JSON.stringify(tb.placed[0].rect));

  const cbx = (await call('place_fields', { fields: [{
    page: 1, type: 'checkbox', points: 1,
    boxes: [{ rect: { x: 0.06, y: 0.36, w: 0.02, h: 0.02 }, correct: true },
            { rect: { x: 0.10, y: 0.36, w: 0.02, h: 0.02 } }]
  }] })).json;
  check('coloca casillas y marca la correcta', cbx.placed[0].boxes?.length === 2);

  const tab = (await call('place_fields', { fields: [{
    page: 1, type: 'table', points: 2, rect: { x: 0.06, y: 0.42, w: 0.4, h: 0.1 },
    colHeaders: ['A', 'B'], rows: [['uno|1', 'dos']]
  }] })).json;
  const tabCfg = (await call('list_fields', { page: 1 })).json.fields.find(f => f.type === 'table').config;
  check('coloca una tabla con alternativas por celda',
    tabCfg.rows === 1 && tabCfg.cols === 2 && tabCfg.cellAnswers[0][0].length === 2,
    tabCfg.cellAnswers[0][0].join(' / '));

  await call('place_fields', { fields: [{
    page: 1, type: 'record', points: 1, rect: { x: 0.5, y: 0.42, w: 0.3, h: 0.08 },
    scoreMode: 'participation', maxSec: 45
  }] });
  const recCfg = (await call('list_fields', { page: 1 })).json.fields.find(f => f.type === 'record').config;
  check('coloca una grabación de voz', recCfg.scoreMode === 'participation' && recCfg.maxSec === 45);

  // Borrado real sobre la imagen de fondo
  const red = (await call('redact_areas', { page: 1, areas: [{ x: 0.1, y: 0.1, w: 0.3, h: 0.05 }] })).json;
  check('borra un área de la página', red.borradas === 1 && red.image.startsWith('pages/'),
    `texto eliminado del análisis: ${red.textoEliminado}`);

  let fueraDePagina = false;
  try { await call('redact_areas', { page: 1, areas: [{ x: 0.9, y: 0.1, w: 0.3, h: 0.05 }] }); }
  catch (e) { fueraDePagina = /se sale de la página/.test(e.message); }
  check('rechaza borrar fuera de la página', fueraDePagina);

  const pv = await call('preview_page', { page: 1 });
  check('devuelve la vista previa', Boolean(pv.image), pv.image ? `${Math.round(pv.image.data.length / 1365)} KB de PNG` : 'sin imagen');

  const first = placed.placed[0].id;
  const adj = (await call('adjust_field', { id: first, rect: { x: 0.1 } })).json;
  check('ajusta un campo', adj.rect.x === 0.1);

  const del = (await call('remove_fields', { ids: [first] })).json;
  check('borra un campo', del.removed.length === 1 && del.totalFields === fields.length + 4);

  await call('set_worksheet_info', { title: 'Ficha de prueba MCP', lang: 'es' });
  const saved = (await call('save_worksheet', { path: path.join(OUT, 'prueba') })).json;
  check('guarda el paquete', fs.existsSync(saved.path) && saved.bytes > 1000, `${saved.path} (${saved.bytes} bytes)`);

  console.log(fails ? `\n${fails} comprobación(es) fallidas` : '\nTodo correcto');
  srv.stdin.end();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FALLO:', e.message); srv.stdin.end(); process.exit(1); });
