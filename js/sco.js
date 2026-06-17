// Arranque del SCO dentro de un paquete SCORM 1.2 exportado.
//
// El paquete lleva la ficha empaquetada como `ficha.zip` (mismo formato que la
// exportación normal) y este script: descomprime la ficha, monta el visor y,
// al corregir, reporta la nota y el estado al LMS mediante ScormReporter.
//
// La configuración del SCORM (umbral de aprobado y modo de estado) la inyecta
// el exportador en `window.OW_SCORM` dentro del index.html del paquete.

import { mountPlayer } from './player.js';
import { importFichaZip } from './zipio.js';
import { setLang, applyI18n, getLang } from './i18n.js';
import { ScormReporter } from './scorm-rte.js';

const cfg = window.OW_SCORM || { masteryScore: 50, statusMode: 'score' };
const root = document.getElementById('app');

const reporter = new ScormReporter();
reporter.init();
// Cerrar la sesión SCORM al salir, para que el LMS guarde el último estado.
window.addEventListener('pagehide', () => reporter.finish());
window.addEventListener('unload', () => reporter.finish());

async function main() {
  const resp = await fetch('ficha.zip');
  if (!resp.ok) throw new Error('No se pudo cargar ficha.zip (HTTP ' + resp.status + ')');
  const ficha = await importFichaZip(await resp.arrayBuffer());

  // El alumno no elige idioma: se usa el de la ficha (o el del navegador).
  if (ficha.manifest.lang) setLang(ficha.manifest.lang, { save: false, reload: false });
  document.documentElement.lang = getLang();
  applyI18n();
  document.title = ficha.manifest.title || 'OpenWorksheets';

  mountPlayer(root, ficha, {
    // El nombre lo conoce el LMS: evitamos la pantalla de identificación.
    studentName: reporter.studentName(),
    // Al corregir, normalizamos la nota a 0–100 y la enviamos al LMS.
    // Devolvemos si se envió, para que el visor lo refleje en la pantalla final.
    onGraded: ({ earned, total }) => {
      const score = total > 0 ? (earned / total) * 100 : 0;
      const passed = score >= (Number(cfg.masteryScore) || 0);
      return reporter.report({ score, passed, statusMode: cfg.statusMode });
    }
  });
}

main().catch(err => {
  console.error(err);
  root.innerHTML = '<div style="max-width:560px;margin:48px auto;padding:24px;'
    + 'font-family:system-ui,sans-serif;text-align:center">'
    + '<h1>Error al cargar la ficha</h1><p style="white-space:pre-wrap">'
    + String(err && err.message || err) + '</p></div>';
});
