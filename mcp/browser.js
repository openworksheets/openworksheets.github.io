// Chromium sin interfaz como motor de render del servidor MCP.
//
// Se habla con el navegador por CDP con un cliente propio (cdp.js), sin
// dependencias: así la carpeta funciona recién descomprimida, sin «npm install»
// ni terminal.
//
// Se reutiliza el pdf.js del propio proyecto (vendor/) en lugar de una librería
// aparte: así el PDF se convierte en páginas exactamente igual que cuando el
// profesor lo sube al editor, y lo que ve el modelo en la vista previa es lo
// que verá el alumnado. Para que pdf.js pueda cargar su worker hace falta
// servir los archivos por http, así que se levanta un servidor local efímero
// (solo escucha en 127.0.0.1 y sirve la carpeta del proyecto en modo lectura).
//
// Hay dos páginas de trabajo:
//   - workbench.html: rasteriza el PDF y lee su capa de texto.
//   - render.html: monta la ficha con el visor real del alumnado (js/player.js)
//     para que la vista previa sea la ficha misma, no un dibujo aproximado.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { launch } = require('./cdp');
const { findChrome } = require('./chrome');

// El servidor sirve su propia carpeta: así funciona tanto dentro del repositorio
// completo como descargado a solas (que es lo normal — la aplicación se usa en
// openworksheets.github.io y nadie se baja el sitio entero para esto).
const ROOT = __dirname;

// Copia de la aplicación con la que se compone la vista previa real. En el
// paquete que se descarga va dentro de la propia carpeta (app/); dentro del
// repositorio se usan directamente los archivos del proyecto, para no
// mantener dos copias que se desincronizan.
function findAppRoot() {
  const candidatos = [path.join(ROOT, 'app'), path.resolve(ROOT, '..')];
  for (const c of candidatos) {
    if (fs.existsSync(path.join(c, 'js', 'player.js')) && fs.existsSync(path.join(c, 'css', 'app.css'))) return c;
  }
  return null;
}

const APP_ROOT = findAppRoot();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

let server = null;
let browser = null;
let page = null;
let viewerPage = null;

// Traduce una ruta de la URL a un archivo. /app/… siempre sale de la copia de
// la aplicación; el resto de la carpeta del MCP, con la excepción de /vendor/…,
// que cae en la aplicación si aquí no está (MathJax, por ejemplo, solo hace
// falta para la vista previa).
function resolveFile(rel) {
  if (rel.startsWith('app/')) {
    if (!APP_ROOT) return null;
    const f = path.join(APP_ROOT, rel.slice(4));
    return f.startsWith(APP_ROOT) ? f : null;
  }
  const propio = path.join(ROOT, rel);
  if (!propio.startsWith(ROOT)) return null;
  if (fs.existsSync(propio)) return propio;
  if (APP_ROOT && rel.startsWith('vendor/')) {
    const f = path.join(APP_ROOT, rel);
    if (f.startsWith(APP_ROOT) && fs.existsSync(f)) return f;
  }
  return propio;   // que responda 404 con su nombre
}

async function startServer() {
  if (server) return server.address().port;
  server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    const file = resolveFile(rel);
    if (!file) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server.address().port;
}

async function chrome() {
  if (!browser) browser = await launch(findChrome());
  return browser;
}

// Devuelve la página del banco de trabajo, arrancándolo la primera vez.
// Se hace perezosamente: las herramientas que no tocan imágenes (listar campos,
// ajustar, guardar) no pagan el arranque del navegador.
async function workbench() {
  if (page) return page;
  const port = await startServer();
  page = await (await chrome()).newPage();
  await page.goto(`http://127.0.0.1:${port}/workbench.html`);
  const ready = await page.evaluate(() => Boolean(window.__owsReady));
  if (!ready) throw new Error('El banco de trabajo no ha arrancado: ' + page.errors.join(' | '));
  return page;
}

// Página del visor real. Devuelve null si no está la copia de la aplicación:
// quien llama se queda entonces con la vista previa dibujada del banco de
// trabajo, que es peor pero siempre funciona.
async function viewer() {
  if (!APP_ROOT) return null;
  if (viewerPage) return viewerPage;
  const port = await startServer();
  const p = await (await chrome()).newPage();
  await p.goto(`http://127.0.0.1:${port}/render.html`);
  const ready = await p.evaluate(() => Boolean(window.__owsViewerReady));
  if (!ready) throw new Error('El visor no ha arrancado: ' + p.errors.join(' | '));
  viewerPage = p;
  return viewerPage;
}

function hasApp() {
  return Boolean(APP_ROOT);
}

async function close() {
  if (browser) await browser.close().catch(() => {});
  if (server) server.close();
  browser = null; page = null; viewerPage = null; server = null;
}

module.exports = { workbench, viewer, hasApp, close };
