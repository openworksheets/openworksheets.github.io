// Arranque de una ficha exportada como página web autónoma (index.html del
// paquete «Exportar a web»). Tiene dos modos según la URL:
//
//   index.html            → carga la ficha empaquetada junto a este archivo
//                           (./ficha.owpkg) y monta el visor del alumno.
//   index.html#e=<datos>  → abre el enlace de entrega que genera el alumnado al
//                           terminar; muestra el panel de corrección del docente
//                           (acumula entregas en una tabla con resumen y CSV).
//   index.html#corregir   → abre ese panel vacío para ir pegando enlaces.
//
// Requiere servirse por http(s): el `fetch` de la ficha y el Service Worker de
// los paquetes incrustados (SCORM/web) no funcionan al abrir el HTML como
// archivo local (file://). Por eso hay que subirlo a un servidor web.

import { el, toast, decompressFromBase64url } from './util.js';
import { importFichaZip } from './zipio.js';
import { mountPlayer } from './player.js';
import { decryptManifestForStudent, isEncryptedManifest, decryptSubmission, isEncryptedSubmission } from './submissionCrypto.js';
import { verifyEntrega } from './entrega.js';
import { createClassPanel } from './classview.js';
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

// ---- Modo corrección: panel de clase (enlaces #e= y archivos .owsub) ----

// Diálogo de contraseña de descifrado de entregas (no destruye el panel).
function askDecryptDialog() {
  return new Promise(resolve => {
    const input = el('input', { type: 'password', autocomplete: 'off', required: '' });
    const form = el('form', { method: 'dialog' },
      el('h2', { style: 'margin-top:0' }, t('crypto.decryptTitle')),
      el('p', {}, t('crypto.decryptIntro')),
      el('label', { class: 'f-label' }, t('crypto.decryptPasswordLabel')),
      input,
      el('div', { style: 'margin-top:14px;display:flex;gap:8px;justify-content:flex-end' },
        el('button', { class: 'btn', value: 'cancel', formnovalidate: '' }, t('dlg.cancel')),
        el('button', { class: 'btn primary', value: 'ok' }, t('crypto.decryptContinue'))));
    const dlg = el('dialog', { class: 'crypto-dialog' }, form);
    dlg.addEventListener('close', () => { const v = dlg.returnValue === 'ok' ? input.value : ''; dlg.remove(); resolve(v); });
    document.body.appendChild(dlg);
    dlg.showModal();
    input.focus();
  });
}

let rememberedPwd = '';
async function ensureDecrypted(data) {
  if (!isEncryptedSubmission(data)) return data;
  if (rememberedPwd) {
    try { return await decryptSubmission(data, rememberedPwd); } catch { rememberedPwd = ''; }
  }
  while (true) {
    const pwd = await askDecryptDialog();
    if (!pwd) return null; // cancelado
    try { const d = await decryptSubmission(data, pwd); rememberedPwd = pwd; return d; }
    catch (e) { console.error(e); toast(t('crypto.decryptError'), 'error'); }
  }
}

function showClassPanel(initialHash) {
  root.textContent = '';
  const detailEl = el('div', { style: 'display:none;border:2px solid transparent;border-radius:14px;padding:12px;margin:16px 0' });
  const tableEl = el('div', { style: 'display:none' });
  const urlInput = el('textarea', { rows: '2', placeholder: t('web.pasteUrlPlaceholder'),
    style: 'width:100%;box-sizing:border-box;font-family:inherit;resize:vertical' });
  const fileInput = el('input', { type: 'file', accept: '.owsub', multiple: '', style: 'display:none' });
  const form = el('form', {},
    el('label', { class: 'f-label' }, t('web.classIntro')),
    urlInput,
    el('div', { style: 'margin-top:10px;display:flex;gap:10px;flex-wrap:wrap' },
      el('button', { class: 'btn primary', type: 'submit' }, t('web.addBtn')),
      el('button', { class: 'btn', type: 'button', onclick: () => fileInput.click() }, t('web.openFilesBtn'))));

  // Clave por carpeta del sitio: cada ficha alojada mantiene su propia lista.
  const dir = location.pathname.replace(/[^/]*$/, '');
  const panel = createClassPanel({ tableEl, detailEl, storageKey: 'openworksheets:webClass:' + dir });

  async function ingest(rawData) {
    const data = await ensureDecrypted(rawData);
    if (!data) return false;
    const res = await verifyEntrega(data);
    panel.addEntrega(data, res.valid);
    return true;
  }

  async function addFromText(text) {
    const tokens = String(text || '').split(/\s+/).map(s => s.trim()).filter(Boolean);
    if (!tokens.length) { toast(t('web.pasteEmpty'), 'error'); return; }
    let bad = 0;
    for (const tok of tokens) {
      const i = tok.indexOf('#e=');
      const payload = i >= 0 ? tok.slice(i + 3) : tok;
      try { await ingest(await decompressFromBase64url(payload)); }
      catch { bad++; }
    }
    if (bad) toast(t('web.badUrl'), 'error');
  }

  form.addEventListener('submit', e => { e.preventDefault(); const v = urlInput.value; urlInput.value = ''; addFromText(v); });
  fileInput.addEventListener('change', async e => {
    const files = [...e.target.files]; e.target.value = '';
    for (const f of files) { try { await ingest(JSON.parse(await f.text())); } catch { toast(t('web.badUrl'), 'error'); } }
  });

  root.appendChild(el('div', { style: 'max-width:960px;margin:24px auto;padding:0 16px' },
    el('div', { class: 'card anim-in' },
      el('h1', { style: 'margin-top:0' }, t('web.classTitle')),
      form, fileInput, detailEl, tableEl)));

  document.title = t('web.classTitle');
  panel.render();

  // Entrega que venía en el enlace abierto: se añade y se limpia el hash para
  // que recargar no la duplique.
  if (initialHash && initialHash.startsWith('#e=')) {
    addFromText(initialHash);
    history.replaceState(null, '', location.pathname + location.search);
  }
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

const hash = window.location.hash;
if (hash.startsWith('#e=') || hash === '#corregir') showClassPanel(hash);
else showFicha();
