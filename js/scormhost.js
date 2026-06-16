// Hospedaje de paquetes SCORM en el navegador, sin servidor.
//
// Registra el Service Worker (scorm-sw.js) y aprovisiona los archivos de cada
// paquete en la Cache API bajo «./scorm-run/<token>/...». El SW los sirve al
// iframe del SCO con el Content-Type correcto, de modo que las rutas relativas
// del paquete funcionan igual que si lo sirviera un LMS.
//
// Requiere contexto seguro (https o localhost): los Service Workers no están
// disponibles al abrir los HTML como archivo local (file://).

const CACHE = 'openworksheets-scorm';

// Content-Type por extensión (los tipos habituales en paquetes SCORM).
const MIME = {
  html: 'text/html', htm: 'text/html', xhtml: 'application/xhtml+xml',
  js: 'text/javascript', mjs: 'text/javascript', css: 'text/css',
  json: 'application/json', xml: 'application/xml', txt: 'text/plain',
  csv: 'text/csv', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg',
  jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
  ico: 'image/x-icon', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
  oga: 'audio/ogg', m4a: 'audio/mp4', mp4: 'video/mp4', webm: 'video/webm',
  ogv: 'video/ogg', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf',
  otf: 'font/otf', eot: 'application/vnd.ms-fontobject',
  swf: 'application/x-shockwave-flash', pdf: 'application/pdf',
  wasm: 'application/wasm', map: 'application/json'
};

function mimeFor(path) {
  const ext = path.includes('.') ? path.split('.').pop().toLowerCase() : '';
  return MIME[ext] || 'application/octet-stream';
}

export function scormSupported() {
  return typeof navigator !== 'undefined'
    && 'serviceWorker' in navigator
    && typeof caches !== 'undefined'
    && (typeof window === 'undefined' || window.isSecureContext);
}

// URL base (absoluta, termina en «/») de un paquete dado su token.
export function scormRunBase(token) {
  return new URL(`./scorm-run/${encodeURIComponent(token)}/`, location.href).href;
}

let registration = null;
let registerPromise = null;

export function registerScormSw() {
  if (!scormSupported()) return Promise.resolve(false);
  if (registerPromise) return registerPromise;
  registerPromise = (async () => {
    try {
      registration = await navigator.serviceWorker.register(
        new URL('./scorm-sw.js', document.baseURI).href
      );
      await navigator.serviceWorker.ready;
      // En la primera visita el SW puede no controlar todavía la página (sus
      // peticiones no se interceptarían). Esperamos a que tome el control.
      if (!navigator.serviceWorker.controller) {
        await new Promise(res => {
          const timer = setTimeout(res, 3000);
          navigator.serviceWorker.addEventListener('controllerchange',
            () => { clearTimeout(timer); res(); }, { once: true });
        });
      }
      return true;
    } catch {
      return false;
    }
  })();
  return registerPromise;
}

// Vuelca a la caché todos los archivos del paquete (los de state.files cuyo
// path empieza por `pkgPrefix`). Devuelve la URL base para cargar el SCO.
export async function provisionScormPackage(token, files, pkgPrefix) {
  const cache = await caches.open(CACHE);
  const base = scormRunBase(token);
  const tasks = [];
  for (const [path, blob] of files) {
    if (!path.startsWith(pkgPrefix)) continue;
    const internal = path.slice(pkgPrefix.length).replace(/^\/+/, '');
    if (!internal) continue;
    const url = base + encodeURI(internal);
    tasks.push(cache.put(url, new Response(blob, {
      headers: { 'Content-Type': mimeFor(internal) }
    })));
  }
  await Promise.all(tasks);
  return base;
}

// Elimina de la caché las entradas de un paquete (al cerrar o reiniciar).
export async function releaseScormPackage(token) {
  if (typeof caches === 'undefined') return;
  const cache = await caches.open(CACHE);
  const base = scormRunBase(token);
  const keys = await cache.keys();
  await Promise.all(keys.filter(req => req.url.startsWith(base)).map(req => cache.delete(req)));
}
