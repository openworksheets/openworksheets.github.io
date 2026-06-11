// Descarga del ZIP de la ficha desde una URL pública.
//
// Estrategias, en orden:
//   1. Descarga directa con fetch (funciona en GitHub, servidores propios, etc.).
//   2. Proxy de Google Apps Script, si está configurado en config.js
//      (necesario normalmente para Google Drive, que bloquea CORS).
//   3. Proxies CORS públicos como último recurso.

function config() {
  return window.WORKPDF_CONFIG || { gasUrl: '', corsProxies: [] };
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
//   ?url=...&bundle=1                      → { name, size, base64 } | { error }
//   ?url=...&bundle=1&part=N&chunkSize=S   → { totalSize, start, end, size, base64, ... }
const GAS_CHUNK = 6 * 1024 * 1024;

async function gasJson(query) {
  const resp = await fetch(query);
  if (!resp.ok) throw new Error('Proxy: HTTP ' + resp.status);
  return resp.json();
}

async function tryGas(url, onProgress) {
  const gasUrl = config().gasUrl;
  if (!gasUrl) throw new Error('Sin proxy configurado');
  const base = gasUrl + '?url=' + encodeURIComponent(url) + '&bundle=1';

  const data = await gasJson(base);
  if (!data.error && data.base64) {
    const bytes = base64ToBytes(data.base64);
    if (!looksLikeZip(bytes)) throw new Error('El proxy no devolvió un ZIP.');
    if (onProgress) onProgress(bytes.length, bytes.length);
    return bytes;
  }
  // Solo merece la pena trocear si el fallo es por tamaño.
  const err = String(data.error || 'respuesta vacía');
  if (!/grande|l[ií]mite|supera/i.test(err)) throw new Error('Proxy: ' + err);

  const parts = [];
  let received = 0;
  let total = 0;
  for (let part = 0; part < 500; part++) {
    const d = await gasJson(base + '&part=' + part + '&chunkSize=' + GAS_CHUNK);
    if (d.error) throw new Error('Proxy: ' + d.error);
    const bytes = base64ToBytes(d.base64 || '');
    if (!bytes.length) break;
    parts.push(bytes);
    received += bytes.length;
    total = Number(d.totalSize) || total;
    if (onProgress) onProgress(received, total);
    if (total && received >= total) break;
    // Servidores sin soporte de Range devuelven el archivo entero en el part 0.
    if (part === 0 && bytes.length > Number(d.chunkSize || GAS_CHUNK)) break;
  }
  const out = new Uint8Array(received);
  let offset = 0;
  for (const p of parts) { out.set(p, offset); offset += p.length; }
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

// Descarga el ZIP y devuelve sus bytes (Uint8Array).
// onStatus(texto) y onProgress(recibido, total) son opcionales.
export async function downloadZip(url, { onStatus, onProgress } = {}) {
  const status = onStatus || (() => {});
  const errors = [];

  status('Descargando la ficha…');
  try {
    return await tryDirect(url, onProgress);
  } catch (e) {
    errors.push('directa: ' + e.message);
  }

  if (config().gasUrl) {
    status('Descargando a través del proxy…');
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

  throw new Error(
    'No se pudo descargar la ficha. Comprueba que el archivo es público ' +
    '("cualquier persona con el enlace") y que la URL es correcta.\n' +
    'Detalle: ' + errors.join(' · ')
  );
}
