// Página de inicio: generador del enlace para el alumnado. La verificación de
// entregas vive ahora en su propia página (entregas.html / js/entregas.js).

import { toast, copyToClipboard } from './util.js';
import { buildShortLink, parseDriveId } from './drive.js';
import { t, applyI18n, initLangSelector, getLang } from './i18n.js';
import { stashFile } from './filehandoff.js';
import { typesetMath } from './mathrender.js';

// Entrega recibida por enlace (#e=…): los enlaces que genera el alumnado apuntan
// a index.html por compatibilidad. La corrección se hace en entregas.html, así
// que redirigimos allí conservando el hash.
if (window.location.hash.startsWith('#e=')) {
  window.location.replace('entregas.html' + window.location.hash);
}

applyI18n();
initLangSelector();
typesetMath(document.body);

// Ficha de ejemplo según el idioma activo (fallback: español).
const EXAMPLE_ZIPS = {
  es: 'ejemplos/ficha-de-prueba-para-openworksheets.owpkg',
  ca: 'ejemplos/fitxa-de-prova-per-a-openworksheets.owpkg',
  gl: 'ejemplos/ficha-de-exemplo-para-openworksheets.owpkg',
  eu: 'ejemplos/openworksheets-erako-adibide-fitxa.owpkg',
  en: 'ejemplos/test-for-openworksheets.owpkg'
};
const linkEjemplo = document.getElementById('linkEjemplo');
if (linkEjemplo) {
  const zip = EXAMPLE_ZIPS[getLang()] || EXAMPLE_ZIPS.es;
  linkEjemplo.href = 'editor.html?ejemplo=' + zip;
}

// «Abrir ficha»: el usuario elige un paquete (.owpkg) en la portada y lo abrimos
// en el editor. El selector de archivos exige un gesto del usuario que no se
// conserva al navegar, así que guardamos la ficha elegida y la recoge el editor.
const btnAbrirFicha = document.getElementById('btnAbrirFicha');
const inputAbrirFicha = document.getElementById('inputAbrirFicha');
if (btnAbrirFicha && inputAbrirFicha) {
  btnAbrirFicha.addEventListener('click', () => inputAbrirFicha.click());
  inputAbrirFicha.addEventListener('change', async () => {
    const file = inputAbrirFicha.files[0];
    inputAbrirFicha.value = '';
    if (!file) return;
    try {
      await stashFile(file);
      location.href = 'editor.html?abrir=1';
    } catch (e) {
      console.error(e);
      toast(t('toast.openError'), 'error');
    }
  });
}

const $ = s => document.querySelector(s);
const APP_VERSION = window.OPENWORKSHEETS_CONFIG?.appVersion || '';

document.querySelectorAll('[data-app-version]').forEach(el => {
  el.textContent = APP_VERSION || el.textContent;
});

// --- Generar enlace ---

$('#btnGenerar').addEventListener('click', async () => {
  const url = $('#urlZip').value.trim();
  if (!url) { toast(t('toast.pasteUrl'), 'error'); return; }
  if (!/^https?:\/\//i.test(url)) { toast(t('toast.invalidUrl'), 'error'); return; }
  if (/drive\.google\.com/.test(url) && !parseDriveId(url)) {
    toast(t('toast.driveError'), 'error');
    return;
  }
  const btn = $('#btnGenerar');
  btn.disabled = true;
  toast(t('toast.generating'), 'info');
  const { link } = await buildShortLink(url);
  btn.disabled = false;
  $('#enlaceAlumnos').textContent = link;
  const tryBtn = $('#btnProbarEnlace');
  if (tryBtn) tryBtn.href = link;
  $('#salidaEnlace').style.display = 'block';
  const ok = await copyToClipboard(link);
  if (ok) toast(t('toast.linkCopied'), 'ok');
});

$('#btnCopiarEnlace').addEventListener('click', async () => {
  const ok = await copyToClipboard($('#enlaceAlumnos').textContent);
  toast(ok ? t('toast.copied') : t('toast.notCopied'), ok ? 'ok' : 'error');
});

// --- Modal «Generar enlace» de la pantalla de inicio ---

const dlgCompartir = $('#dlgCompartir');

$('#btnAbrirCompartir')?.addEventListener('click', () => dlgCompartir.showModal());

document.querySelectorAll('[data-close-dialog]').forEach(btn => {
  btn.addEventListener('click', () => btn.closest('dialog')?.close());
});

// Cerrar al pulsar sobre el fondo (backdrop) del diálogo.
dlgCompartir?.addEventListener('click', e => { if (e.target === dlgCompartir) dlgCompartir.close(); });
