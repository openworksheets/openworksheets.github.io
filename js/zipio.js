// Exportación e importación de fichas como paquete OpenWorksheets (.owpkg).
// El paquete es internamente un ZIP; la extensión .owpkg lo distingue del ZIP
// SCORM que también genera el programa (que debe seguir siendo .zip para el
// LMS). Al abrir se aceptan tanto .owpkg como .zip (compatibilidad con fichas
// guardadas con la extensión antigua); la validación real es el campo
// `manifest.format`, no la extensión.
// Estructura del paquete:
//   manifest.json          → definición completa de la ficha
//   pages/page-N.webp|jpg  → imágenes de fondo
//   assets/                → recursos adicionales (reservado)
//
// Usa JSZip (vendor/jszip.min.js → window.JSZip).

import { t } from './i18n.js';

export const FORMAT = 'workpdf-ficha';
export const FORMAT_VERSION = 1;

// ficha = { manifest, files: Map<ruta, Blob> }
export async function exportFichaZip(ficha) {
  const zip = new window.JSZip();
  zip.file('manifest.json', JSON.stringify(ficha.manifest, null, 2));
  for (const [path, blob] of ficha.files) {
    zip.file(path, blob);
  }
  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
}

// Topes al abrir un ZIP (ficha o paquete). Son altos a propósito, para que
// ninguna ficha real los alcance: solo frenan un archivo dañado o preparado
// para colgar el navegador (un «ZIP bomba», muy comprimido y enorme al
// descomprimirse). La comprobación usa los tamaños que declara el propio ZIP,
// antes de descomprimir nada, y se repite con lo que realmente se extrae.
export const ZIP_LIMITS = {
  maxEntries: 50000,
  maxBytes: 2 * 1024 ** 3,       // 2 GB descomprimido en total
  bombBytes: 200 * 1024 ** 2,    // a partir de 200 MB…
  maxRatio: 100                  // …no se admite una compresión de más de 100 a 1
};

export class ZipLimitError extends Error {}

function formatSize(bytes) {
  return bytes >= 1024 ** 3 ? (bytes / 1024 ** 3).toFixed(1) + ' GB' : Math.round(bytes / 1024 ** 2) + ' MB';
}

// Ruta interna aceptable: relativa, sin «..» ni barras invertidas.
export function safeZipPath(path) {
  return !/^[\\/]/.test(path) && !path.includes('\\') && !path.split('/').includes('..');
}

// Abre un ZIP con JSZip y comprueba los topes antes de descomprimir nada.
// Devuelve { zip, track }: `track(bytes)` suma lo extraído de verdad y lanza
// el mismo error si supera el tope (por si el ZIP declara tamaños falsos).
export async function loadZipSafely(data) {
  const zip = await window.JSZip.loadAsync(data);
  const packed = data?.size ?? data?.byteLength ?? 0;
  let entries = 0;
  let declared = 0;
  zip.forEach((path, entry) => {
    if (entry.dir) return;
    entries++;
    declared += entry._data?.uncompressedSize || 0;
  });
  if (entries > ZIP_LIMITS.maxEntries) {
    const num = x => x.toLocaleString(document.documentElement.lang || undefined);
    throw new ZipLimitError(t('zipio.tooManyFiles', { n: num(entries), max: num(ZIP_LIMITS.maxEntries) }));
  }
  if (declared > ZIP_LIMITS.maxBytes) {
    throw new ZipLimitError(t('zipio.tooBig', { size: formatSize(declared), max: formatSize(ZIP_LIMITS.maxBytes) }));
  }
  if (packed > 0 && declared > ZIP_LIMITS.bombBytes && declared / packed > ZIP_LIMITS.maxRatio) {
    throw new ZipLimitError(t('zipio.suspicious', { size: formatSize(declared) }));
  }
  let extracted = 0;
  const track = bytes => {
    extracted += bytes;
    if (extracted > ZIP_LIMITS.maxBytes) {
      throw new ZipLimitError(t('zipio.tooBig', { size: formatSize(extracted), max: formatSize(ZIP_LIMITS.maxBytes) }));
    }
  };
  return { zip, track };
}

export async function importFichaZip(data) {
  const { zip, track } = await loadZipSafely(data);
  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) throw new Error(t('zipio.noManifest'));
  let manifest;
  try {
    manifest = JSON.parse(await manifestFile.async('string'));
  } catch {
    throw new Error(t('zipio.badManifest'));
  }
  if (manifest.format !== FORMAT) {
    throw new Error(t('zipio.notWorkpdf'));
  }
  const files = new Map();
  const entries = [];
  zip.forEach((path, entry) => {
    if (!entry.dir && path !== 'manifest.json' && safeZipPath(path)) entries.push({ path, entry });
  });
  for (const { path, entry } of entries) {
    const blob = await entry.async('blob');
    track(blob.size);
    files.set(path, blob);
  }
  for (const page of manifest.pages || []) {
    if (!files.has(page.image)) {
      throw new Error(t('zipio.missingImage', { path: page.image }));
    }
  }
  return { manifest, files };
}

// Devuelve solo los ficheros realmente usados por el manifiesto, descartando
// huérfanos (p. ej. recortes o medios de campos borrados). Un fichero se
// conserva si su ruta aparece citada en el manifiesto («"ruta"») o si está bajo
// el prefijo `pkg` de algún campo SCORM (cuyos archivos internos no se citan uno
// a uno en el manifiesto, solo el prefijo de la carpeta).
export function usedFiles(manifest, files) {
  const json = JSON.stringify(manifest);
  // Prefijos de paquetes (SCORM y webs incrustadas embed zip/elpx): sus archivos
  // internos no se citan uno a uno en el manifiesto, solo el prefijo `pkg`.
  const pkgPrefixes = [];
  for (const page of manifest.pages || []) {
    for (const f of page.fields || []) {
      if (f.config?.pkg) pkgPrefixes.push(f.config.pkg);
    }
  }
  const keep = new Map();
  for (const [path, blob] of files) {
    if (json.includes('"' + path + '"') || pkgPrefixes.some(pre => path.startsWith(pre))) {
      keep.set(path, blob);
    }
  }
  return keep;
}

export function newManifest() {
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    id: 'wpf' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    title: '',
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
      encryptSubmissions: false,
      fontFamily: 'atkinson',
      scorm: { statusMode: 'score', masteryScore: 50 }
    },
    access: {
      desde: '',
      hasta: '',
      autoEntrega: false,
      tiempoLimite: 0,
      password: ''
    },
    pages: []
  };
}
