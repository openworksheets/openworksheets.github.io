// Conversión de PDF e imágenes a páginas de fondo de la ficha.
// Usa pdf.js (vendor/pdf.min.js, cargado como script clásico → window.pdfjsLib).

import { readFileAsArrayBuffer, loadImageSize } from './util.js';

const TARGET_WIDTH = 1600; // píxeles de ancho de la imagen renderizada

let workerConfigured = false;
function pdfjs() {
  const lib = window.pdfjsLib;
  if (!lib) throw new Error('No se ha cargado pdf.js');
  if (!workerConfigured) {
    lib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.js', import.meta.url).href;
    workerConfigured = true;
  }
  return lib;
}

// Codifica un canvas como webp y, si el navegador no lo soporta (Safari),
// como jpeg. Devuelve { blob, ext }.
function canvasToBlob(canvas) {
  return new Promise(resolve => {
    canvas.toBlob(blob => {
      if (blob && blob.type === 'image/webp') {
        resolve({ blob, ext: 'webp' });
      } else {
        canvas.toBlob(b2 => resolve({ blob: b2, ext: 'jpg' }), 'image/jpeg', 0.88);
      }
    }, 'image/webp', 0.85);
  });
}

// Convierte un archivo PDF en una lista de páginas:
// [{ blob, ext, w, h }], con onProgress(actual, total) opcional.
export async function pdfToPages(file, onProgress) {
  const data = await readFileAsArrayBuffer(file);
  const doc = await pdfjs().getDocument({ data }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    if (onProgress) onProgress(n, doc.numPages);
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(3, TARGET_WIDTH / base.width);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctxc = canvas.getContext('2d');
    ctxc.fillStyle = '#ffffff';
    ctxc.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctxc, viewport }).promise;
    const { blob, ext } = await canvasToBlob(canvas);
    pages.push({ blob, ext, w: canvas.width, h: canvas.height });
  }
  doc.destroy();
  return pages;
}

// Usa una imagen tal cual como página (sin recodificar).
export async function imageToPage(file) {
  const { w, h } = await loadImageSize(file);
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const safe = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext) ? ext : 'png';
  return { blob: file, ext: safe, w, h };
}

export function isPdf(file) {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

export function isImage(file) {
  return /^image\//.test(file.type) || /\.(png|jpe?g|webp|gif|svg)$/i.test(file.name);
}
