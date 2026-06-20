// Exportación de una ficha como paquete SCORM 1.2 (ZIP para Moodle u otro LMS).
//
// El paquete es autónomo: incluye una copia del visor de OpenWorksheets, la
// ficha empaquetada (`ficha.zip`, mismo formato que la exportación normal) y los
// archivos que exige SCORM 1.2:
//   imsmanifest.xml   → describe el SCO y la nota mínima (masteryscore)
//   index.html        → el SCO; arranca el visor (js/sco.js)
//
// Estructura del ZIP resultante:
//   imsmanifest.xml
//   index.html
//   ficha.zip
//   css/  fonts/  vendor/  js/   (el código del visor)
//
// Usa JSZip (window.JSZip) y la exportación de ficha de zipio.js.

import { exportFichaZip } from './zipio.js';

// Archivos del visor que se copian al paquete. Son el subconjunto que necesita
// el reproductor del alumno (sin el editor ni la importación de PDF).
const APP_FILES = [
  'css/app.css',
  'vendor/jszip.min.js',
  'vendor/mathjax-tex-svg.js',
  'fonts/opendyslexic-400.woff2',
  'fonts/opendyslexic-700.woff2',
  'favicon.svg',
  'scorm-sw.js',
  'js/player.js', 'js/render.js', 'js/grading.js', 'js/fieldtypes.js',
  'js/fonts.js', 'js/entrega.js', 'js/submissionCrypto.js', 'js/scormhost.js',
  'js/scorm.js', 'js/util.js', 'js/icons.js', 'js/i18n.js', 'js/markdown.js',
  'js/mathrender.js', 'js/edicuatex.js',
  'js/zipio.js', 'js/scorm-rte.js', 'js/sco.js'
];

function escapeXml(s) {
  return String(s || '').replace(/[<>&'"]/g, c => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]
  ));
}

// Identificador técnico estable y válido para XML a partir del id de la ficha.
function safeId(id) {
  return 'OW-' + String(id || Date.now().toString(36)).replace(/[^A-Za-z0-9_-]/g, '');
}

function buildIndexHtml(manifest, scorm) {
  const cfg = JSON.stringify({
    masteryScore: Number(scorm.masteryScore) || 0,
    statusMode: scorm.statusMode === 'completion' ? 'completion' : 'score'
  });
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
  <script>window.OW_SCORM=${cfg};(function(){try{var t=localStorage.getItem('wpf-tema');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>
</head>
<body>
  <div id="app"></div>
  <script src="vendor/jszip.min.js"></script>
  <script type="module" src="js/sco.js"></script>
</body>
</html>
`;
}

function buildManifestXml(manifest, scorm, fileList) {
  const id = safeId(manifest.id);
  const title = escapeXml(manifest.title || 'OpenWorksheets');
  const files = fileList.map(f => `      <file href="${escapeXml(f)}"/>`).join('\n');
  // La nota mínima solo es significativa cuando el estado es aprobado/suspenso.
  const mastery = scorm.statusMode === 'completion'
    ? ''
    : `\n        <adlcp:masteryscore>${Math.round(Number(scorm.masteryScore) || 0)}</adlcp:masteryscore>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${id}" version="1.2"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="${id}-ORG">
    <organization identifier="${id}-ORG">
      <title>${title}</title>
      <item identifier="${id}-ITEM" identifierref="${id}-RES" isvisible="true">
        <title>${title}</title>${mastery}
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="${id}-RES" type="webcontent" adlcp:scormtype="sco" href="index.html">
${files}
    </resource>
  </resources>
</manifest>
`;
}

// ficha   = { manifest, files: Map<ruta, Blob> }
// scorm   = { masteryScore, statusMode }
// Devuelve un Blob con el ZIP del paquete SCORM 1.2.
export async function exportScormPackage(ficha, scorm) {
  const zip = new window.JSZip();

  // Dentro del SCORM la entrega la registra el LMS: el manifiesto va en claro,
  // sin cifrado de entrega ni contraseña de acceso (el LMS gestiona el acceso).
  const manifest = JSON.parse(JSON.stringify(ficha.manifest));
  manifest.settings = manifest.settings || {};
  manifest.settings.encryptSubmissions = false;
  delete manifest.submissionCrypto;
  if (manifest.access) manifest.access.password = '';

  // 1) Copia del visor (se lee del propio despliegue mediante fetch relativo).
  const base = new URL('.', document.baseURI).href;
  await Promise.all(APP_FILES.map(async path => {
    const resp = await fetch(new URL(path, base).href);
    if (!resp.ok) throw new Error(`No se pudo leer «${path}» (HTTP ${resp.status})`);
    zip.file(path, await resp.blob());
  }));

  // 2) La ficha, empaquetada con el formato estándar de OpenWorksheets.
  zip.file('ficha.zip', await exportFichaZip({ manifest, files: ficha.files }));

  // 3) SCO + manifiesto SCORM. El manifiesto lista todos los archivos del paquete.
  zip.file('index.html', buildIndexHtml(manifest, scorm));
  const fileList = ['index.html', 'ficha.zip', ...APP_FILES];
  zip.file('imsmanifest.xml', buildManifestXml(manifest, scorm, fileList));

  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
}
