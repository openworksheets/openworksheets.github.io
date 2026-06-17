// Página de inicio: generador de enlaces para el alumnado y
// verificación de entregas.

import { toast, copyToClipboard, decompressFromBase64url } from './util.js';
import { buildShortLink, parseDriveId } from './drive.js';
import { verifyEntrega } from './entrega.js';
import { decryptSubmission, isEncryptedSubmission } from './submissionCrypto.js';
import { createClassPanel } from './classview.js';
import { esc } from './verifyview.js';
import { t, applyI18n, initLangSelector, getLang } from './i18n.js';

applyI18n();
initLangSelector();

// Ficha de ejemplo según el idioma activo (fallback: español).
const EXAMPLE_ZIPS = {
  es: 'ejemplos/ficha-de-prueba-para-openworksheets.owpkg',
  ca: 'ejemplos/fitxa-de-prova-per-a-openworksheets.owpkg',
  en: 'ejemplos/test-for-openworksheets.owpkg'
};
const linkEjemplo = document.getElementById('linkEjemplo');
if (linkEjemplo) {
  const zip = EXAMPLE_ZIPS[getLang()] || EXAMPLE_ZIPS.es;
  linkEjemplo.href = 'editor.html?ejemplo=' + zip;
}

const $ = s => document.querySelector(s);
const APP_VERSION = window.OPENWORKSHEETS_CONFIG?.appVersion || '';
const DECRYPT_PASSWORD_KEY = 'workpdf:decrypt-password';
const EYE_SVG = '<svg class="eye-show" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg><svg class="eye-hide" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

document.querySelectorAll('[data-app-version]').forEach(el => {
  el.textContent = APP_VERSION || el.textContent;
});

function getRememberedDecryptPassword() {
  try { return sessionStorage.getItem(DECRYPT_PASSWORD_KEY) || ''; } catch { return ''; }
}

function rememberDecryptPassword(password) {
  try { sessionStorage.setItem(DECRYPT_PASSWORD_KEY, password); } catch { /* sesion no disponible */ }
}

function forgetDecryptPassword() {
  try { sessionStorage.removeItem(DECRYPT_PASSWORD_KEY); } catch { /* sesion no disponible */ }
}

function askDecryptPassword() {
  return new Promise(resolve => {
    const dlg = document.createElement('dialog');
    dlg.className = 'crypto-dialog';
    dlg.innerHTML = `
      <form method="dialog">
        <h2>${esc(t('crypto.decryptTitle'))}</h2>
        <p>${esc(t('crypto.decryptIntro'))}</p>
        <p class="warn">${esc(t('crypto.decryptWarning'))}</p>
        <label class="f-label">${esc(t('crypto.decryptPasswordLabel'))}</label>
        <div class="password-row">
          <input type="password" autocomplete="current-password" required>
          <button type="button" class="pw-toggle" title="${esc(t('crypto.showPassword'))}">${EYE_SVG}</button>
        </div>
        <label class="check-row">
          <input type="checkbox">
          <span>${esc(t('crypto.rememberPasswordLabel'))}</span>
        </label>
        <div class="dlg-buttons">
          <button class="btn" value="cancel" formnovalidate>${esc(t('dlg.cancel'))}</button>
          <button class="btn primary" value="ok">${esc(t('crypto.decryptContinue'))}</button>
        </div>
      </form>`;
    const passwordInput = dlg.querySelector('input[type="password"]');
    const rememberInput = dlg.querySelector('input[type="checkbox"]');
    dlg.addEventListener('close', () => {
      const out = dlg.returnValue === 'ok'
        ? { password: passwordInput.value, remember: rememberInput.checked }
        : { password: '', remember: false };
      dlg.remove();
      resolve(out);
    });
    document.body.appendChild(dlg);
    dlg.showModal();
    passwordInput.focus();
  });
}

document.addEventListener('click', ev => {
  const btn = ev.target.closest?.('.pw-toggle');
  if (!btn) return;
  const input = btn.parentElement?.querySelector('input');
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
  btn.classList.toggle('on', input.type === 'text');
  btn.title = input.type === 'password' ? t('crypto.showPassword') : t('crypto.hidePassword');
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

// --- Verificar y gestionar entregas de clase ---
// El render de la tarjeta de verificación (verifyview.js) y el panel acumulado
// de clase con su CSV (classview.js) son módulos compartidos con la página web
// autónoma exportada (webrun.js).

const classPanel = createClassPanel({
  tableEl: $('#classTbl'),
  detailEl: $('#salidaVerificacion')
});

async function processEntregaData(raw) {
  const out = $('#salidaVerificacion');
  let data = raw;
  if (isEncryptedSubmission(data)) {
    let password = getRememberedDecryptPassword();
    if (!password) {
      const answer = await askDecryptPassword();
      password = answer.password;
      if (password && answer.remember) rememberDecryptPassword(password);
    }
    if (!password) return;
    try {
      data = await decryptSubmission(data, password);
    } catch (err) {
      console.error(err);
      forgetDecryptPassword();
      out.textContent = t('crypto.decryptError');
      out.style.display = 'block';
      out.style.borderColor = 'var(--rojo)';
      out.style.background = 'var(--rojo-claro)';
      return;
    }
  }
  const res = await verifyEntrega(data);
  classPanel.addEntrega(data, res.valid);
}

function showBadJson() {
  const out = $('#salidaVerificacion');
  out.textContent = t('verify.badJson');
  out.style.display = 'block';
  out.style.borderColor = 'var(--rojo)';
  out.style.background = 'var(--rojo-claro)';
}

$('#btnVerificar').addEventListener('click', () => $('#inputEntrega').click());

$('#inputEntrega').addEventListener('change', async e => {
  const files = [...e.target.files];
  e.target.value = '';
  for (const file of files) {
    try { await processEntregaData(JSON.parse(await file.text())); }
    catch { showBadJson(); }
  }
});

// Drag & drop de archivos JSON sobre la sección de verificación
const verifySection = document.getElementById('verifySection');
verifySection.addEventListener('dragover', e => { e.preventDefault(); verifySection.classList.add('drag-over'); });
verifySection.addEventListener('dragleave', e => { if (!verifySection.contains(e.relatedTarget)) verifySection.classList.remove('drag-over'); });
verifySection.addEventListener('drop', async e => {
  e.preventDefault();
  verifySection.classList.remove('drag-over');
  const files = [...e.dataTransfer.files].filter(f => f.name.endsWith('.owsub') || f.name.endsWith('.json') || f.type === 'application/json');
  for (const file of files) {
    try { await processEntregaData(JSON.parse(await file.text())); }
    catch { showBadJson(); }
  }
});

// Restaurar lista guardada al arrancar
classPanel.render();

// Entrega recibida por URL (alumno compartió el enlace)
if (window.location.hash.startsWith('#e=')) {
  (async () => {
    try {
      const data = await decompressFromBase64url(window.location.hash.slice(3));
      await processEntregaData(data);
    } catch { showBadJson(); }
  })();
}
