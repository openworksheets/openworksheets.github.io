// Arranque del visor del alumno (alumno.html).
// Con ?d=<datos> o ?z=<url> descarga la ficha automáticamente; sin parámetro
// permite abrir un ZIP local o pegar un enlace.

import { el, toast } from './util.js';
import { toDirectUrl } from './drive.js';
import { downloadZip, fetchRemoteMeta } from './download.js';
import { importFichaZip } from './zipio.js';
import { mountPlayer } from './player.js';
import { decryptManifestForStudent, isEncryptedManifest } from './submissionCrypto.js';
import { buildWorksheetCacheKey, cacheWorksheet, getCachedWorksheet, getCachedWorksheetRecord } from './alumno-cache.js';
import { t, getLang, setLang, applyI18n, initLangSelector } from './i18n.js';

applyI18n();
initLangSelector();

const root = document.getElementById('app');

function formatMB(bytes) {
  return (bytes / 1048576).toFixed(1).replace('.', ',') + ' MB';
}

function isReloadNavigation() {
  try {
    const nav = performance.getEntriesByType('navigation')[0];
    return nav?.type === 'reload';
  } catch {
    return false;
  }
}

// ¿El alumnado tiene un intento en curso de esta ficha? Si es así, no se debe
// avisar de una versión nueva: al recargar para abrirla se perdería el progreso
// del intento (respuestas, temporizador e incidencias) que estaba realizando.
function hasActiveAttempt(manifestId) {
  if (!manifestId) return false;
  try {
    const raw = localStorage.getItem('workpdf:al:' + manifestId);
    if (!raw) return false;
    const data = JSON.parse(raw);
    // Formato nuevo: un perfil por alumno. Formato antiguo: intento plano.
    if (data?.students) return Object.values(data.students).some(p => p?.attemptActive);
    return Boolean(data?.attemptActive);
  } catch {
    return false;
  }
}

// Compara los validadores HTTP de dos versiones: prioriza ETag, luego
// Last-Modified y, como último recurso, el tamaño.
function sameRemoteMeta(a, b) {
  if (!a || !b) return false;
  if (a.etag || b.etag) return a.etag === b.etag;
  if (a.lastModified || b.lastModified) return a.lastModified === b.lastModified;
  if (a.size || b.size) return a.size === b.size;
  return false;
}

// Comprueba en segundo plano si la ficha remota ha cambiado, usando validadores
// HTTP ligeros (sin descargar el archivo completo). Solo descarga la ficha si el
// origen expone validadores y estos indican un cambio real, y nunca interrumpe
// un intento en curso. En orígenes servidos por proxy (Google Drive) no hay
// validadores accesibles, por lo que no se comprueba.
async function checkRemoteUpdate({ directUrl, cacheKey, manifestId, cachedMeta }) {
  if (!cachedMeta || hasActiveAttempt(manifestId)) return;
  try {
    const freshMeta = await fetchRemoteMeta(directUrl);
    if (!freshMeta || sameRemoteMeta(cachedMeta, freshMeta)) return;
    const bytes = await downloadZip(directUrl);
    const imported = await importFichaZip(bytes);
    await cacheWorksheet({
      key: cacheKey,
      manifestId: imported.manifest?.id || manifestId || '',
      sourceUrl: directUrl,
      data: bytes,
      meta: freshMeta
    });
    toast(t('alumno.updateAvailable'));
  } catch {
    // Si falla la comprobación, se sigue usando la copia guardada sin molestar.
  }
}

function showLoading() {
  root.textContent = '';
  const status = el('p', {}, t('alumno.connecting'));
  const barra = el('div', {});
  // Aviso de carga lenta: oculto al principio y mostrado solo si la descarga se
  // alarga (p. ej. fichas grandes o conexión lenta), para no alarmar cuando va
  // rápido. El temporizador no necesita limpiarse: si la pantalla ya se sustituyó
  // (al montar el visor o mostrar un error), el elemento deja de estar conectado.
  const hint = el('p', { style: 'margin-top:14px;font-size:.85rem;opacity:.7', hidden: true }, t('alumno.loadingHint'));
  root.appendChild(el('div', { class: 'al-centro' },
    el('div', { class: 'card al-tarjeta al-carga' },
      el('div', { class: 'spinner' }),
      el('h1', {}, t('alumno.loadingTitle')),
      status,
      el('div', { class: 'al-progreso' }, barra),
      hint)));
  setTimeout(() => { if (hint.isConnected) hint.hidden = false; }, 10000);
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
  const inputZip = el('input', { type: 'file', accept: '.owpkg', style: 'display:none' });
  inputZip.addEventListener('change', async () => {
    const file = inputZip.files[0];
    if (!file) return;
    try {
      const imported = await importFichaZip(file);
      const cacheKey = buildWorksheetCacheKey({ manifestId: imported.manifest?.id || '' });
      try {
        await cacheWorksheet({ key: cacheKey, manifestId: imported.manifest?.id || '', data: file });
        const u = new URL(window.location.href);
        u.searchParams.set('r', cacheKey);
        window.history.replaceState(null, '', u);
      } catch { /* caché no disponible */ }
      const ficha = await unlockFicha(imported);
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
  const packedUrl = params.get('d');
  const shortToken = params.get('s');
  const resumeKey = params.get('r');

  // Modo incrustado (iframe en un blog/web): oculta la barra superior del visor
  // para que la ficha ocupe todo el marco. Se activa con `embed=1`.
  if (params.get('embed') === '1') document.body.classList.add('embed-mode');

  if (!zipUrl && !packedUrl && !shortToken && !resumeKey) { showOpener(); return; }

  const loading = showLoading();
  try {
    if (resumeKey) {
      loading.setStatus(t('alumno.opening'));
      const cached = await getCachedWorksheet(resumeKey);
      if (cached) {
        const ficha = await unlockFicha(await importFichaZip(cached));
        if (!localStorage.getItem('wpf-lang') && ficha.manifest.lang) {
          setLang(ficha.manifest.lang, { save: false, reload: false });
          applyI18n();
        }
        mountPlayer(root, ficha);
        return;
      }
      if (!zipUrl && !packedUrl && !shortToken) { showOpener(); return; }
    }
    if (packedUrl) {
      loading.setStatus(t('alumno.connecting'));
      const { resolvePackedUrl } = await import('./drive.js');
      zipUrl = await resolvePackedUrl(packedUrl);
    }
    if (shortToken) {
      loading.setStatus(t('alumno.connecting'));
      const { resolveShortToken } = await import('./drive.js');
      zipUrl = await resolveShortToken(shortToken);
    }
    const directUrl = toDirectUrl(zipUrl);
    const remoteCacheKey = buildWorksheetCacheKey({ sourceUrl: directUrl });
    const cachedRemote = await getCachedWorksheetRecord(remoteCacheKey);
    if (cachedRemote?.blob) {
      loading.setStatus(t('alumno.openingSaved'));
      const ficha = await unlockFicha(await importFichaZip(cachedRemote.blob));
      if (!localStorage.getItem('wpf-lang') && ficha.manifest.lang) {
        setLang(ficha.manifest.lang, { save: false, reload: false });
        applyI18n();
      }
      mountPlayer(root, ficha);
      if (!isReloadNavigation()) {
        void checkRemoteUpdate({
          directUrl,
          cacheKey: remoteCacheKey,
          manifestId: ficha.manifest?.id || cachedRemote.manifestId || '',
          cachedMeta: cachedRemote.meta || null
        });
      }
      return;
    }
    const bytes = await downloadZip(directUrl, {
      onStatus: loading.setStatus,
      onProgress: loading.setProgress
    });
    loading.setStatus(t('alumno.opening'));
    const imported = await importFichaZip(bytes);
    try {
      const meta = await fetchRemoteMeta(directUrl);
      await cacheWorksheet({
        key: remoteCacheKey,
        manifestId: imported.manifest?.id || '',
        sourceUrl: directUrl,
        data: bytes,
        meta
      });
    } catch { /* caché no disponible */ }
    const ficha = await unlockFicha(imported);
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
