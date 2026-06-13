// Arranque del visor del alumno (alumno.html).
// Con ?z=<url> descarga el ZIP automáticamente; sin parámetro permite
// abrir un ZIP local o pegar un enlace.

import { el, toast } from './util.js';
import { toDirectUrl } from './drive.js';
import { downloadZip } from './download.js';
import { importFichaZip } from './zipio.js';
import { mountPlayer } from './player.js';
import { decryptManifestForStudent, isEncryptedManifest } from './submissionCrypto.js';
import { t, getLang, setLang, applyI18n, initLangSelector } from './i18n.js';

applyI18n();
initLangSelector();

const root = document.getElementById('app');

function formatMB(bytes) {
  return (bytes / 1048576).toFixed(1).replace('.', ',') + ' MB';
}

function showLoading() {
  root.textContent = '';
  const status = el('p', {}, t('alumno.connecting'));
  const barra = el('div', {});
  root.appendChild(el('div', { class: 'al-centro' },
    el('div', { class: 'card al-tarjeta al-carga' },
      el('div', { class: 'spinner' }),
      el('h1', {}, t('alumno.loadingTitle')),
      status,
      el('div', { class: 'al-progreso' }, barra))));
  return {
    setStatus: msg => { status.textContent = msg; },
    setProgress: (recibido, total) => {
      if (total > 0) {
        barra.style.width = Math.min(100, recibido / total * 100) + '%';
        status.textContent = t('alumno.downloading', { received: formatMB(recibido), total: formatMB(total) });
      } else {
        barra.style.width = '100%';
        status.textContent = t('alumno.downloadingUnk', { received: formatMB(recibido) });
      }
    }
  };
}

function showError(message) {
  root.textContent = '';
  root.appendChild(el('div', { class: 'al-centro' },
    el('div', { class: 'card al-tarjeta' },
      el('div', { class: 'icono' }, '✕'),
      el('h1', {}, t('alumno.errorTitle')),
      el('p', { style: 'white-space:pre-wrap;text-align:left;font-size:.92rem' }, message),
      el('button', { class: 'btn', onclick: () => window.location.reload() }, t('alumno.retry')))));
}

function askWorksheetPassword(ficha) {
  return new Promise(resolve => {
    root.textContent = '';
    const pass = el('input', { type: 'password', autocomplete: 'off', required: '' });
    const form = el('form', {},
      el('label', { class: 'f-label' }, t('player.passwordLabel')),
      pass,
      el('div', { style: 'margin-top:18px;text-align:center' },
        el('button', { class: 'btn primary', type: 'submit' }, t('player.startBtn'))));
    form.addEventListener('submit', e => {
      e.preventDefault();
      resolve(pass.value);
    });
    root.appendChild(el('div', { class: 'al-centro' },
      el('div', { class: 'card al-tarjeta anim-in' },
        el('h1', {}, ficha.manifest.title || 'OpenWorksheets'),
        el('p', {}, t('alumno.encryptedDesc')),
        form)));
    pass.focus();
  });
}

async function unlockFicha(ficha) {
  while (isEncryptedManifest(ficha.manifest)) {
    const password = await askWorksheetPassword(ficha);
    if (!password) continue;
    try {
      return {
        ...ficha,
        manifest: await decryptManifestForStudent(ficha.manifest, password)
      };
    } catch (e) {
      console.error(e);
      toast(t('player.passwordWrong'), 'error');
    }
  }
  return ficha;
}

function showOpener() {
  root.textContent = '';
  const inputZip = el('input', { type: 'file', accept: '.zip', style: 'display:none' });
  inputZip.addEventListener('change', async () => {
    const file = inputZip.files[0];
    if (!file) return;
    try {
      const ficha = await unlockFicha(await importFichaZip(file));
      mountPlayer(root, ficha);
    } catch (e) {
      toast(e.message, 'error');
    }
  });

  const urlInput = el('input', { type: 'url', placeholder: t('alumno.urlPlaceholder') });
  const form = el('form', {},
    el('label', { class: 'f-label' }, t('alumno.linkLabel')),
    urlInput,
    el('div', { style: 'margin-top:12px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap' },
      el('button', { class: 'btn primary', type: 'submit' }, t('alumno.openBtn')),
      el('button', { class: 'btn', type: 'button', onclick: () => inputZip.click() }, t('alumno.openZipBtn'))));
  form.addEventListener('submit', e => {
    e.preventDefault();
    const url = urlInput.value.trim();
    if (!url) { toast(t('alumno.pasteLink'), 'error'); return; }
    window.location.search = '?z=' + encodeURIComponent(url);
  });

  root.appendChild(el('div', { class: 'al-centro' },
    el('div', { class: 'card al-tarjeta anim-in' },
      el('h1', {}, t('alumno.openTitle')),
      el('p', {}, t('alumno.openDesc')),
      form,
      inputZip)));
}

async function main() {
  const params = new URLSearchParams(window.location.search);
  let zipUrl = params.get('z') || params.get('url');
  const shortToken = params.get('s');

  if (!zipUrl && !shortToken) { showOpener(); return; }

  const loading = showLoading();
  try {
    if (shortToken) {
      loading.setStatus(t('alumno.connecting'));
      const { resolveShortToken } = await import('./drive.js');
      zipUrl = await resolveShortToken(shortToken);
    }
    const bytes = await downloadZip(toDirectUrl(zipUrl), {
      onStatus: loading.setStatus,
      onProgress: loading.setProgress
    });
    loading.setStatus(t('alumno.opening'));
    const ficha = await unlockFicha(await importFichaZip(bytes));
    // Herencia de idioma: si el alumno no tiene preferencia manual, usa el del profesor
    if (!localStorage.getItem('wpf-lang') && ficha.manifest.lang) {
      setLang(ficha.manifest.lang, { save: false, reload: false });
      applyI18n();
    }
    mountPlayer(root, ficha);
  } catch (e) {
    console.error(e);
    showError(e.message);
  }
}

main();
