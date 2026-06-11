// Exportación e importación de fichas en formato ZIP.
// Estructura del paquete:
//   manifest.json          → definición completa de la ficha
//   pages/page-N.webp|jpg  → imágenes de fondo
//   assets/                → recursos adicionales (reservado)
//
// Usa JSZip (vendor/jszip.min.js → window.JSZip).

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

export async function importFichaZip(data) {
  const zip = await window.JSZip.loadAsync(data);
  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) throw new Error('El ZIP no contiene manifest.json: no es una ficha de WorkPDF.');
  let manifest;
  try {
    manifest = JSON.parse(await manifestFile.async('string'));
  } catch {
    throw new Error('El manifest.json del ZIP no es válido.');
  }
  if (manifest.format !== FORMAT) {
    throw new Error('El ZIP no es una ficha de WorkPDF.');
  }
  const files = new Map();
  const entries = [];
  zip.forEach((path, entry) => {
    if (!entry.dir && path !== 'manifest.json') entries.push({ path, entry });
  });
  for (const { path, entry } of entries) {
    files.set(path, await entry.async('blob'));
  }
  for (const page of manifest.pages || []) {
    if (!files.has(page.image)) {
      throw new Error(`Falta la imagen ${page.image} dentro del ZIP.`);
    }
  }
  return { manifest, files };
}

export function newManifest() {
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    id: 'wpf' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    title: '',
    author: '',
    instructions: '',
    settings: {
      showScore: true,
      showCorrection: true,
      shuffle: false,
      maxAttempts: 0
    },
    pages: []
  };
}
