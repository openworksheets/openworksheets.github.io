// Exportación de una ficha como página web autónoma (ZIP para subir a un sitio
// web propio). El paquete es totalmente funcional sin OpenWorksheets: incluye
// una copia del visor del alumno, la ficha empaquetada (`ficha.owpkg`, el mismo
// formato que la exportación normal) y un `index.html` que la arranca.
//
// Estructura del ZIP resultante:
//   index.html        → arranca el visor (js/webrun.js)
//   ficha.owpkg       → la ficha (con su cifrado/contraseña si los tiene)
//   css/ fonts/ vendor/ js/  (el código del visor)
//
// A diferencia del SCORM, conserva el cifrado de entrega y la contraseña de
// acceso de la ficha (aquí no hay un LMS que gestione el acceso). La entrega del
// alumnado se hace por archivo descargado: el docente la verifica en la web de
// OpenWorksheets.
//
// Usa JSZip (window.JSZip) y la exportación de ficha de zipio.js.

import { exportFichaZip } from './zipio.js';

// Archivos del visor que se copian al paquete: el subconjunto que necesita el
// reproductor del alumno en modo normal (sin editor, sin importación de PDF y
// sin el SCO/RTE de SCORM, que solo hace falta dentro de un LMS).
const APP_FILES = [
  'css/app.css',
  'vendor/jszip.min.js',
  'fonts/opendyslexic-400.woff2',
  'fonts/opendyslexic-700.woff2',
  'favicon.svg',
  'scorm-sw.js',
  'js/player.js', 'js/render.js', 'js/grading.js', 'js/fieldtypes.js',
  'js/fonts.js', 'js/entrega.js', 'js/submissionCrypto.js', 'js/scormhost.js',
  'js/scorm.js', 'js/util.js', 'js/icons.js', 'js/i18n.js', 'js/markdown.js',
  'js/zipio.js', 'js/verifyview.js', 'js/webrun.js'
];

function escapeHtml(s) {
  return String(s || '').replace(/[<>&"]/g, c => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]
  ));
}

function buildIndexHtml(manifest) {
  const lang = escapeHtml(manifest.lang || 'es');
  const title = escapeHtml(manifest.title || 'OpenWorksheets');
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="icon" href="favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="css/app.css">
  <script>(function(){try{var t=localStorage.getItem('wpf-tema');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>
</head>
<body>
  <div id="app"></div>
  <script src="vendor/jszip.min.js"></script>
  <script type="module" src="js/webrun.js"></script>
</body>
</html>
`;
}

// ficha = { manifest, files: Map<ruta, Blob> }  (manifest ya saneado/cifrado).
// Devuelve un Blob con el ZIP de la página web autónoma.
export async function exportWebPackage(ficha) {
  const zip = new window.JSZip();

  // 1) Copia del visor (se lee del propio despliegue mediante fetch relativo).
  const base = new URL('.', document.baseURI).href;
  await Promise.all(APP_FILES.map(async path => {
    const resp = await fetch(new URL(path, base).href);
    if (!resp.ok) throw new Error(`No se pudo leer «${path}» (HTTP ${resp.status})`);
    zip.file(path, await resp.blob());
  }));

  // 2) La ficha, empaquetada con el formato estándar de OpenWorksheets.
  zip.file('ficha.owpkg', await exportFichaZip(ficha));

  // 3) Página de arranque.
  zip.file('index.html', buildIndexHtml(ficha.manifest));

  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
}
