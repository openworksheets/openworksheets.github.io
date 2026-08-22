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

const http = require('http');
const fs = require('fs');
const path = require('path');
const { launch } = require('./cdp');

// El servidor sirve su propia carpeta: así funciona tanto dentro del repositorio
// completo como descargado a solas (que es lo normal — la aplicación se usa en
// openworksheets.github.io y nadie se baja el sitio entero para esto).
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg'
};

function findChromium() {
  const candidates = [
    process.env.OWS_CHROME,
    process.env.CHROME_PATH,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ].filter(Boolean);
  for (const c of candidates) {
    try { fs.accessSync(c, fs.constants.X_OK); return c; } catch { /* siguiente */ }
  }
  throw new Error('No se ha encontrado Chromium. Instálalo o define OWS_CHROME con su ruta.');
}

let server = null;
let browser = null;
let page = null;

async function startServer() {
  server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    const file = path.join(ROOT, rel);
    // No salir de la carpeta del proyecto.
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server.address().port;
}

// Devuelve la página del banco de trabajo, arrancándolo la primera vez.
// Se hace perezosamente: las herramientas que no tocan imágenes (listar campos,
// ajustar, guardar) no pagan el arranque del navegador.
async function workbench() {
  if (page) return page;
  const port = await startServer();
  browser = await launch(findChromium());
  page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/workbench.html`);
  const ready = await page.evaluate(() => Boolean(window.__owsReady));
  if (!ready) throw new Error('El banco de trabajo no ha arrancado: ' + page.errors.join(' | '));
  return page;
}

async function close() {
  if (browser) await browser.close().catch(() => {});
  if (server) server.close();
  browser = null; page = null; server = null;
}

module.exports = { workbench, close };
