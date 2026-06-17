// Arranque de una ficha exportada como página web autónoma (index.html del
// paquete «Exportar a web»). Tiene dos modos según la URL:
//
//   index.html            → carga la ficha empaquetada junto a este archivo
//                           (./ficha.owpkg) y monta el visor del alumno.
//   index.html#e=<datos>  → enlace de entrega que genera el alumnado al terminar:
//                           redirige a entregas.html (la misma página «Ver y
//                           verificar entregas» del programa principal).
//   index.html#corregir   → redirige a entregas.html con el panel vacío.
//
// Requiere servirse por http(s): el `fetch` de la ficha y el Service Worker de
// los paquetes incrustados (SCORM/web) no funcionan al abrir el HTML como
// archivo local (file://). Por eso hay que subirlo a un servidor web.

import { el, toast } from './util.js';
import { importFichaZip } from './zipio.js';
import { mountPlayer } from './player.js';
import { decryptManifestForStudent, isEncryptedManifest } from './submissionCrypto.js';
import { t, setLang, applyI18n } from './i18n.js';

applyI18n();

const root = document.getElementById('app');

function showError(message) {
  root.textContent = '';
  root.appendChild(el('div', { class: 'al-centro' },
    el('div', { class: 'card al-tarjeta' },
      el('div', { class: 'icono' }, '✕'),
      el('h1', {}, t('alumno.errorTitle')),
      el('p', { style: 'white-space:pre-wrap;text-align:left;font-size:.92rem' }, message),
      el('button', { class: 'btn', onclick: () => window.location.reload() }, t('alumno.retry')))));
}

// Formulario de contraseña a pantalla completa (para descifrar la ficha).
function askFichaPassword(titulo) {
  return new Promise(resolve => {
    root.textContent = '';
    const pass = el('input', { type: 'password', autocomplete: 'off', required: '' });
    const form = el('form', {},
      el('p', {}, t('alumno.encryptedDesc')),
      el('label', { class: 'f-label' }, t('player.passwordLabel')),
      pass,
      el('div', { style: 'margin-top:18px;text-align:center' },
        el('button', { class: 'btn primary', type: 'submit' }, t('player.startBtn'))));
    form.addEventListener('submit', e => { e.preventDefault(); resolve(pass.value); });
    root.appendChild(el('div', { class: 'al-centro' },
      el('div', { class: 'card al-tarjeta anim-in' },
        el('h1', {}, titulo || 'OpenWorksheets'),
        form)));
    pass.focus();
  });
}

async function unlockFicha(ficha) {
  while (isEncryptedManifest(ficha.manifest)) {
    const password = await askFichaPassword(ficha.manifest.title);
    if (!password) continue;
    try {
      return { ...ficha, manifest: await decryptManifestForStudent(ficha.manifest, password) };
    } catch (e) {
      console.error(e);
      toast(t('player.passwordWrong'), 'error');
    }
  }
  return ficha;
}

// ---- Modo ficha: index.html ----
async function showFicha() {
  try {
    const resp = await fetch('./ficha.owpkg');
    if (!resp.ok) throw new Error(t('web.loadError', { status: resp.status }));
    const ficha = await unlockFicha(await importFichaZip(await resp.blob()));
    // Herencia de idioma: si el visitante no tiene preferencia propia, usa el del autor.
    if (!localStorage.getItem('wpf-lang') && ficha.manifest.lang) {
      setLang(ficha.manifest.lang, { save: false, reload: false });
      applyI18n();
    }
    document.title = ficha.manifest.title || 'OpenWorksheets';
    mountPlayer(root, ficha);
  } catch (e) {
    console.error(e);
    showError(e.message);
  }
}

// Los enlaces de entrega del alumnado apuntan a index.html#e=… por simplicidad.
// La corrección se hace en entregas.html (misma página que el programa
// principal), así que redirigimos allí conservando el hash.
const hash = window.location.hash;
if (hash.startsWith('#e=')) window.location.replace('entregas.html' + hash);
else if (hash === '#corregir') window.location.replace('entregas.html');
else showFicha();
