// Descarga del ZIP de la ficha desde una URL pública.
//
// Estrategias, en orden:
//   1. Descarga directa con fetch (funciona en GitHub, servidores propios, etc.).
//   2. Proxy de Google Apps Script, si está configurado en config.js
//      (necesario normalmente para Google Drive, que bloquea CORS).
//   3. Proxies CORS públicos como último recurso.

function config() {
  return window.OPENWORKSHEETS_CONFIG || { gasUrl: '', corsProxies: [] };
}

function isGoogleDriveUrl(url) {
  return /(^https?:\/\/)?(?:[^/]+\.)?(drive\.google\.com|drive\.usercontent\.google\.com)\//i.test(url || '');
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function readBody(resp, onProgress) {
  const total = Number(resp.headers.get('Content-Length')) || 0;
  if (!resp.body || !resp.body.getReader) {
    return new Uint8Array(await resp.arrayBuffer());
  }
  const reader = resp.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (onProgress) onProgress(received, total);
  }
  const out = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.length; }
  return out;
}

function looksLikeZip(bytes) {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

async function tryDirect(url, onProgress) {
  const resp = await fetch(url, { redirect: 'follow' });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const bytes = await readBody(resp, onProgress);
  if (!looksLikeZip(bytes)) {
    // Drive devuelve una página HTML intermedia para archivos grandes
    // o no públicos: no sirve como ZIP.
    throw new Error('La respuesta no es un archivo ZIP.');
  }
  return bytes;
}

// Proxy con el protocolo "bundle" de Visor Web-ZIP, de modo que puede
// reutilizarse un despliegue ya existente de ese proyecto:
//   ?url=...&bundle=1&meta=1               → { name, totalSize, chunkSize, ... }
//   ?url=...&bundle=1&part=N&chunkSize=S   → { totalSize, size, base64, chunkSize, ... }
const GAS_CHUNK = 20 * 1024 * 1024;   // 20 MB por trozo (igual que visor-webzip)
const GAS_MAX_PARALLEL = 3;

async function gasJson(query) {
  const resp = await fetch(query, { cache: 'no-store' });
  if (!resp.ok) throw new Error('Proxy: HTTP ' + resp.status);
  return resp.json();
}

function concatParts(parts, size) {
  let total = Number(size) || 0;
  if (!total) for (const p of parts) total += p ? p.length : 0;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) { if (p && p.length) { out.set(p, offset); offset += p.length; } }
  return offset === total ? out : out.slice(0, offset);
}

// Metadatos del archivo en el proxy (tamaño total, trozo sugerido…), sin descargar.
async function gasMeta(gasUrl, url) {
  const data = await gasJson(gasUrl + '?url=' + encodeURIComponent(url) + '&bundle=1&meta=1&ts=' + Date.now());
  if (data && data.error) throw new Error('Proxy: ' + data.error);
  return data || {};
}

// Un trozo del archivo, con reintentos ante fallos transitorios del proxy.
async function gasPart(gasUrl, url, part, chunkSize) {
  const q = gasUrl + '?url=' + encodeURIComponent(url) + '&bundle=1&part=' + part + '&chunkSize=' + chunkSize;
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const data = await gasJson(q);
      if (data && data.error) throw new Error('Proxy: ' + data.error);
      return data || {};
    } catch (e) {
      lastErr = e;
      if (attempt < 2) await sleep(700 * (attempt + 1));
    }
  }
  throw lastErr;
}

// Descarga a través del proxy GAS SIEMPRE por trozos (como visor-webzip): se pide
// primero la metadata y luego las partes, en paralelo si se conoce el tamaño. Así
// se evita pedir el archivo entero de una vez, que para fichas grandes hace que el
// proxy tarde mucho y acabe devolviendo 404/timeout. No requiere cambios en el GAS.
async function tryGas(url, onProgress) {
  const gasUrl = config().gasUrl;
  if (!gasUrl) throw new Error('Sin proxy configurado');

  let chunkSize = GAS_CHUNK;
  let totalSize = 0;
  try {
    const meta = await gasMeta(gasUrl, url);
    if (meta.chunkSize) chunkSize = Number(meta.chunkSize) || chunkSize;
    totalSize = Number(meta.totalSize || meta.size) || 0;
  } catch { /* sin meta: se descarga secuencialmente desde la parte 0 */ }

  // Tamaño conocido: partes en paralelo (más rápido).
  if (totalSize > 0) {
    const totalParts = Math.ceil(totalSize / chunkSize);
    const parts = new Array(totalParts);
    let received = 0;
    let next = 0;
    const worker = async () => {
      while (next < totalParts) {
        const i = next++;
        const data = await gasPart(gasUrl, url, i, chunkSize);
        const bytes = base64ToBytes(data.base64 || '');
        parts[i] = bytes;
        received += bytes.length;
        if (onProgress) onProgress(Math.min(received, totalSize), totalSize);
      }
    };
    const workers = [];
    for (let k = 0; k < Math.min(GAS_MAX_PARALLEL, totalParts); k++) workers.push(worker());
    await Promise.all(workers);
    const out = concatParts(parts, totalSize);
    if (!looksLikeZip(out)) throw new Error('El proxy no devolvió un ZIP.');
    return out;
  }

  // Sin tamaño: descarga secuencial hasta que una parte venga incompleta o vacía.
  const parts = [];
  let received = 0;
  let total = 0;
  for (let part = 0; part < 1000; part++) {
    const data = await gasPart(gasUrl, url, part, chunkSize);
    if (data.chunkSize) chunkSize = Number(data.chunkSize) || chunkSize;
    if (!total && data.totalSize) total = Number(data.totalSize) || 0;
    const bytes = base64ToBytes(data.base64 || '');
    if (!bytes.length) break;
    parts.push(bytes);
    received += bytes.length;
    if (onProgress) onProgress(received, total || 0);
    if (total && received >= total) break;
    if (bytes.length < chunkSize) break; // última parte
  }
  const out = concatParts(parts);
  if (!looksLikeZip(out)) throw new Error('El proxy no devolvió un ZIP.');
  return out;
}

async function tryCorsProxies(url, onProgress) {
  let lastError = null;
  for (const proxy of config().corsProxies || []) {
    const proxied = proxy.url + (proxy.encode ? encodeURIComponent(url) : url);
    try {
      return await tryDirect(proxied, onProgress);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error('Sin proxies disponibles');
}

// Metadatos ligeros del recurso remoto (validadores HTTP) para detectar cambios
// de versión SIN descargar el archivo completo. Devuelve { etag, lastModified,
// size } o null si no se pueden obtener de forma fiable: Google Drive se sirve
// por proxy y no expone estos encabezados por CORS, y otros servidores pueden no
// permitir HEAD o no exponer los validadores. En esos casos se prefiere no
// comprobar la versión antes que descargar la ficha entera en segundo plano.
export async function fetchRemoteMeta(url) {
  if (isGoogleDriveUrl(url)) return null;
  try {
    const resp = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    if (!resp.ok) return null;
    const etag = resp.headers.get('ETag') || '';
    const lastModified = resp.headers.get('Last-Modified') || '';
    const size = Number(resp.headers.get('Content-Length')) || 0;
    if (!etag && !lastModified && !size) return null;
    return { etag, lastModified, size };
  } catch {
    return null;
  }
}

const inflightDownloads = new Map();

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Reintentos automáticos de toda la cadena de descarga: el proxy de Google Apps
// Script falla de forma intermitente (arranque en frío, cuotas, `user_content_key`
// caducado), y normalmente el segundo o tercer intento ya completa. Se reintenta
// la operación completa, sin tocar la lógica del proxy.
const DOWNLOAD_TRIES = 3;

// Un único intento de la cadena de estrategias: directa → proxy → alternativas.
async function attemptDownload(url, status, onProgress) {
  const errors = [];
  const preferGas = isGoogleDriveUrl(url) && Boolean(config().gasUrl);

  if (!preferGas) {
    status('Descargando la ficha…');
    try {
      return await tryDirect(url, onProgress);
    } catch (e) {
      errors.push('directa: ' + e.message);
    }
  }

  if (config().gasUrl) {
    status(preferGas ? 'Conectando con Google Drive…' : 'Descargando a través del proxy…');
    try {
      return await tryGas(url, onProgress);
    } catch (e) {
      errors.push('proxy: ' + e.message);
    }
  }

  status('Intentando rutas alternativas…');
  try {
    return await tryCorsProxies(url, onProgress);
  } catch (e) {
    errors.push('alternativas: ' + e.message);
  }

  const err = new Error(
    'No se pudo descargar la ficha. Comprueba que el archivo es público ' +
    '("cualquier persona con el enlace") y que la URL es correcta.\n' +
    'Detalle: ' + errors.join(' · ')
  );
  err.detail = errors;
  throw err;
}

// Descarga el ZIP y devuelve sus bytes (Uint8Array).
// onStatus(texto) y onProgress(recibido, total) son opcionales.
export async function downloadZip(url, { onStatus, onProgress } = {}) {
  const key = String(url || '').trim();
  if (inflightDownloads.has(key)) return inflightDownloads.get(key);

  const status = onStatus || (() => {});
  const task = (async () => {
    let lastError;
    for (let intento = 1; intento <= DOWNLOAD_TRIES; intento++) {
      try {
        return await attemptDownload(url, status, onProgress);
      } catch (e) {
        lastError = e;
        if (intento < DOWNLOAD_TRIES) {
          status('La descarga falló, reintentando…');
          await sleep(800 * intento);
        }
      }
    }
    throw lastError;
  })();

  inflightDownloads.set(key, task);
  try {
    return await task;
  } finally {
    inflightDownloads.delete(key);
  }
}
