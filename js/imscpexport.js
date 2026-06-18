// Exportación de una ficha como paquete IMS Content Package (ZIP para LMS o
// repositorios de objetos de aprendizaje compatibles con IMS CP 1.1.4).
//
// A diferencia del SCORM, IMS CP no incluye seguimiento ni calificación: el
// paquete es funcionalmente idéntico a la exportación web, pero incluye el
// imsmanifest.xml que exige el estándar IMS CP.
//
// Estructura del ZIP resultante:
//   imsmanifest.xml
//   index.html
//   ficha.owpkg
//   entregas.html
//   css/  fonts/  vendor/  js/   (el código del visor)

import { exportFichaZip } from './zipio.js';

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
  'js/zipio.js', 'js/verifyview.js', 'js/classview.js', 'js/webrun.js',
  'js/entregas.js', 'js/theme.js'
];

function escapeXml(s) {
  return String(s || '').replace(/[<>&'"]/g, c => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]
  ));
}

function safeId(id) {
  return 'OW-' + String(id || Date.now().toString(36)).replace(/[^A-Za-z0-9_-]/g, '');
}

function buildIndexHtml(manifest) {
  const lang = escapeXml(manifest.lang || 'es');
  const title = escapeXml(manifest.title || 'OpenWorksheets');
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

function buildManifestXml(manifest, fileList) {
  const id = safeId(manifest.id);
  const title = escapeXml(manifest.title || 'OpenWorksheets');
  const files = fileList.map(f => `      <file href="${escapeXml(f)}"/>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${id}" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd">
  <metadata>
    <schema>IMS Content</schema>
    <schemaversion>1.1.4</schemaversion>
  </metadata>
  <organizations default="${id}-ORG">
    <organization identifier="${id}-ORG">
      <title>${title}</title>
      <item identifier="${id}-ITEM" identifierref="${id}-RES" isvisible="true">
        <title>${title}</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="${id}-RES" type="webcontent" href="index.html">
${files}
    </resource>
  </resources>
</manifest>
`;
}

function adaptEntregasHtml(html) {
  let out = html
    .split('\n')
    .filter(line => !/analytics|config\.js|nav\.backHome/.test(line))
    .join('\n');
  out = out.replace(/ title="Volver al inicio"/g, '');
  const version = window.OPENWORKSHEETS_CONFIG?.appVersion;
  if (version) {
    out = out.replace(/(<span data-app-version>)[^<]*(<\/span>)/,
      `$1${escapeXml(version)}$2`);
  }
  return out;
}

// ficha = { manifest, files: Map<ruta, Blob> }  (manifest ya saneado).
// Devuelve un Blob con el ZIP del paquete IMS CP.
export async function exportImscpPackage(ficha) {
  const zip = new window.JSZip();

  const base = new URL('.', document.baseURI).href;
  await Promise.all(APP_FILES.map(async path => {
    const resp = await fetch(new URL(path, base).href);
    if (!resp.ok) throw new Error(`No se pudo leer «${path}» (HTTP ${resp.status})`);
    zip.file(path, await resp.blob());
  }));

  zip.file('ficha.owpkg', await exportFichaZip(ficha));
  zip.file('index.html', buildIndexHtml(ficha.manifest));

  const entregasResp = await fetch(new URL('entregas.html', base).href);
  if (!entregasResp.ok) throw new Error(`No se pudo leer «entregas.html» (HTTP ${entregasResp.status})`);
  zip.file('entregas.html', adaptEntregasHtml(await entregasResp.text()));

  const fileList = ['index.html', 'ficha.owpkg', 'entregas.html', ...APP_FILES];
  zip.file('imsmanifest.xml', buildManifestXml(ficha.manifest, fileList));

  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
}
