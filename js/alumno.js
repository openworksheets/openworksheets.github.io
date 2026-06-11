// Arranque del visor del alumno (alumno.html).
// Con ?z=<url> descarga el ZIP automáticamente; sin parámetro permite
// abrir un ZIP local o pegar un enlace.

import { el, toast } from './util.js';
import { downloadZip } from './download.js';
import { importFichaZip } from './zipio.js';
import { mountPlayer } from './player.js';

const root = document.getElementById('app');

function formatMB(bytes) {
  return (bytes / 1048576).toFixed(1).replace('.', ',') + ' MB';
}

function showLoading() {
  root.textContent = '';
  const status = el('p', {}, 'Conectando…');
  const barra = el('div', {});
  root.appendChild(el('div', { class: 'al-centro' },
    el('div', { class: 'card al-tarjeta al-carga' },
      el('div', { class: 'spinner' }),
      el('h1', {}, 'Cargando la ficha'),
      status,
      el('div', { class: 'al-progreso' }, barra))));
  return {
    setStatus: t => { status.textContent = t; },
    setProgress: (recibido, total) => {
      if (total > 0) {
        barra.style.width = Math.min(100, recibido / total * 100) + '%';
        status.textContent = `Descargando: ${formatMB(recibido)} de ${formatMB(total)}`;
      } else {
        barra.style.width = '100%';
        status.textContent = `Descargando: ${formatMB(recibido)}`;
      }
    }
  };
}

function showError(message) {
  root.textContent = '';
  root.appendChild(el('div', { class: 'al-centro' },
    el('div', { class: 'card al-tarjeta' },
      el('div', { class: 'icono' }, '✕'),
      el('h1', {}, 'No se pudo abrir la ficha'),
      el('p', { style: 'white-space:pre-wrap;text-align:left;font-size:.92rem' }, message),
      el('button', { class: 'btn', onclick: () => window.location.reload() }, '↻ Reintentar'))));
}

function showOpener() {
  root.textContent = '';
  const inputZip = el('input', { type: 'file', accept: '.zip', style: 'display:none' });
  inputZip.addEventListener('change', async () => {
    const file = inputZip.files[0];
    if (!file) return;
    try {
      const ficha = await importFichaZip(file);
      mountPlayer(root, ficha);
    } catch (e) {
      toast(e.message, 'error');
    }
  });

  const urlInput = el('input', { type: 'url', placeholder: 'https://drive.google.com/file/d/…' });
  const form = el('form', {},
    el('label', { class: 'f-label' }, 'Enlace de la ficha'),
    urlInput,
    el('div', { style: 'margin-top:12px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap' },
      el('button', { class: 'btn primary', type: 'submit' }, 'Abrir ficha'),
      el('button', { class: 'btn', type: 'button', onclick: () => inputZip.click() }, 'Abrir ZIP local')));
  form.addEventListener('submit', e => {
    e.preventDefault();
    const url = urlInput.value.trim();
    if (!url) { toast('Pega el enlace que te han compartido.', 'error'); return; }
    window.location.search = '?z=' + encodeURIComponent(url);
  });

  root.appendChild(el('div', { class: 'al-centro' },
    el('div', { class: 'card al-tarjeta anim-in' },
      el('div', { class: 'icono' }, '¶'),
      el('h1', {}, 'Abrir una ficha'),
      el('p', {}, 'Pega el enlace que te ha dado tu docente o abre un archivo ZIP de ficha.'),
      form,
      inputZip)));
}

async function main() {
  const params = new URLSearchParams(window.location.search);
  const zipUrl = params.get('z') || params.get('url');
  if (!zipUrl) { showOpener(); return; }

  const loading = showLoading();
  try {
    const bytes = await downloadZip(zipUrl, {
      onStatus: loading.setStatus,
      onProgress: loading.setProgress
    });
    loading.setStatus('Abriendo la ficha…');
    const ficha = await importFichaZip(bytes);
    mountPlayer(root, ficha);
  } catch (e) {
    console.error(e);
    showError(e.message);
  }
}

main();
