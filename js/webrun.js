// Arranque de una ficha exportada como página web autónoma (index.html del
// paquete «Exportar a web»). Tiene dos modos según la URL:
//
//   index.html            → carga la ficha empaquetada junto a este archivo
//                           (./ficha.owpkg) y monta el visor del alumno.
//   index.html#e=<datos>  → abre el enlace de entrega que genera el alumnado al
//                           terminar y muestra su verificación (para el docente).
//
// Requiere servirse por http(s): el `fetch` de la ficha y el Service Worker de
// los paquetes incrustados (SCORM/web) no funcionan al abrir el HTML como
// archivo local (file://). Por eso hay que subirlo a un servidor web.

import { el, toast, decompressFromBase64url } from './util.js';
import { importFichaZip } from './zipio.js';
import { mountPlayer } from './player.js';
import { decryptManifestForStudent, isEncryptedManifest, decryptSubmission, isEncryptedSubmission } from './submissionCrypto.js';
import { verifyEntrega } from './entrega.js';
import { renderVerificacion, mountVerificacion, esc } from './verifyview.js';
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

// Formulario de contraseña reutilizable (ficha cifrada o entrega cifrada).
function askPassword(titulo, intro, btnLabel) {
  return new Promise(resolve => {
    root.textContent = '';
    const pass = el('input', { type: 'password', autocomplete: 'off', required: '' });
    const form = el('form', {},
      intro ? el('p', {}, intro) : null,
      el('label', { class: 'f-label' }, t('player.passwordLabel')),
      pass,
      el('div', { style: 'margin-top:18px;text-align:center' },
        el('button', { class: 'btn primary', type: 'submit' }, btnLabel)));
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
    const password = await askPassword(ficha.manifest.title, t('alumno.encryptedDesc'), t('player.startBtn'));
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

// ---- Modo entrega: index.html#e=<datos> ----
async function showEntregaFromHash() {
  let data;
  try {
    data = await decompressFromBase64url(window.location.hash.slice(3));
  } catch {
    showError(t('verify.badJson'));
    return;
  }
  if (isEncryptedSubmission(data)) {
    while (true) {
      const pwd = await askPassword(data.titulo, t('crypto.decryptIntro'), t('crypto.decryptContinue'));
      if (!pwd) continue;
      try { data = await decryptSubmission(data, pwd); break; }
      catch (e) { console.error(e); toast(t('crypto.decryptError'), 'error'); }
    }
  }
  const res = await verifyEntrega(data);
  const r = { data, valid: res.valid };
  root.textContent = '';
  const wrap = el('div', { style: 'max-width:920px;margin:24px auto;padding:0 16px' });
  wrap.innerHTML = renderVerificacion(r);
  if (!r.valid) {
    wrap.insertAdjacentHTML('afterbegin',
      `<p style="color:var(--rojo);font-weight:600;margin-bottom:8px">✗ ${esc(t('verify.tampered'))}</p>`);
  }
  root.appendChild(wrap);
  // Audio de grabaciones y calificación manual (en memoria, sin persistir).
  mountVerificacion(wrap, r);
  document.title = data.titulo || 'OpenWorksheets';
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

if (window.location.hash.startsWith('#e=')) showEntregaFromHash();
else showFicha();
