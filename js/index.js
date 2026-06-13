// Página de inicio: generador de enlaces para el alumnado y
// verificación de entregas.

import { toast, copyToClipboard, decompressFromBase64url, downloadBlob, fechaHora, formatNum } from './util.js';
import { buildShortLink, parseDriveId } from './drive.js';
import { verifyEntrega } from './entrega.js';
import { decryptSubmission, isEncryptedSubmission } from './submissionCrypto.js';
import { t, applyI18n, initLangSelector } from './i18n.js';

applyI18n();
initLangSelector();

const $ = s => document.querySelector(s);
const DECRYPT_PASSWORD_KEY = 'workpdf:decrypt-password';
const EYE_SVG = '<svg class="eye-show" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg><svg class="eye-hide" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

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

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatAnswer(val) {
  if (val === null || val === undefined || val === '') return '—';
  if (Array.isArray(val)) return val.length ? val.map(String).join(' · ') : '—';
  if (typeof val === 'object') {
    const pairs = Object.entries(val).map(([k, v]) => `${k} → ${v}`);
    return pairs.length ? pairs.join(' · ') : '—';
  }
  return String(val) || '—';
}

function renderVerificacion(data, valid) {
  const singKey = { correcta: 'entrega.correct', incorrecta: 'entrega.incorrect', parcial: 'entrega.partial', 'en blanco': 'entrega.blank' };
  const badgeCls = { correcta: 'ok', incorrecta: 'err', parcial: 'partial', 'en blanco': 'blank' };
  const icon = { correcta: '✓', incorrecta: '✗', parcial: '~', 'en blanco': '·' };

  const integridad = valid
    ? `<span class="vr-badge ok">${esc(t('verify.ok'))}</span>`
    : `<span class="vr-badge err">${esc(t('verify.tampered'))}</span>`;

  const rows = (data.respuestas || []).map((r, i) => {
    const cls = badgeCls[r.resultado] || 'blank';
    const ic = icon[r.resultado] || '·';
    const label = t(singKey[r.resultado] || 'entrega.blank');
    return `<tr>
      <td>${i + 1}</td>
      <td>${r.pagina}</td>
      <td>${esc(t('field.' + r.tipo) || r.tipo)}</td>
      <td class="vr-ans">${esc(formatAnswer(r.respuesta))}</td>
      <td style="white-space:nowrap">${formatNum(r.puntos)} / ${formatNum(r.maximo)}</td>
      <td><span class="vr-badge ${cls}">${ic} ${esc(label)}</span></td>
    </tr>`;
  }).join('');

  return `<div class="verify-card">
    <div class="verify-header">
      ${integridad}
      <div class="verify-meta" style="margin-top:8px">
        <strong>${esc(t('entrega.sheet'))}:</strong> ${esc(data.titulo)}<br>
        <strong>${esc(t('entrega.student'))}:</strong> ${esc(data.alumno)}${data.grupo ? ' (' + esc(data.grupo) + ')' : ''}<br>
        <strong>${esc(t('entrega.date'))}:</strong> ${esc(fechaHora(new Date(data.fecha)))}<br>
        <strong>${esc(t('entrega.score'))}:</strong> ${formatNum(data.nota)} / ${formatNum(data.total)} &nbsp;(${formatNum(data.nota10)} ${esc(t('entrega.over10'))})
      </div>
    </div>
    <table class="verify-table">
      <thead><tr>
        <th>#</th>
        <th>${esc(t('verify.col.page'))}</th>
        <th>${esc(t('verify.col.type'))}</th>
        <th>${esc(t('verify.col.answer'))}</th>
        <th>${esc(t('verify.col.points'))}</th>
        <th>${esc(t('verify.col.result'))}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

// Estado acumulado de la clase (persistido en localStorage)
const CLASS_STORAGE_KEY = 'openworksheets:classResults';

function loadClassResults() {
  try {
    const raw = localStorage.getItem(CLASS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveClassResults() {
  try { localStorage.setItem(CLASS_STORAGE_KEY, JSON.stringify(classResults)); } catch { /* cuota llena */ }
}

const classResults = loadClassResults();
let classSort = { col: 'fecha', dir: -1 };

function addToClass(data, valid) {
  const pct = data.total > 0 ? Math.round(data.nota / data.total * 100) : 0;
  classResults.push({ data, valid, pct });
  saveClassResults();
  renderClassTable();
}

function showDetail(data, valid) {
  const out = $('#salidaVerificacion');
  out.innerHTML = renderVerificacion(data, valid);
  out.style.display = 'block';
  out.style.borderColor = valid ? 'var(--verde)' : 'var(--rojo)';
  out.style.background = valid ? 'var(--verde-claro)' : 'var(--rojo-claro)';
  if (!valid) {
    out.insertAdjacentHTML('afterbegin', `<p style="color:var(--rojo);font-weight:600;margin-bottom:8px">✗ ${esc(t('verify.tampered'))}</p>`);
  }
  out.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderClassTable() {
  const container = $('#classTbl');
  if (classResults.length === 0) { container.style.display = 'none'; return; }
  container.style.display = 'block';

  const { col, dir } = classSort;
  const sorted = classResults.map((r, i) => ({ ...r, _i: i })).sort((a, b) => {
    const get = (r) =>
      col === 'alumno' ? r.data.alumno :
      col === 'grupo'  ? (r.data.grupo || '') :
      col === 'titulo' ? r.data.titulo :
      col === 'pct'    ? r.pct :
      col === 'nota10' ? r.data.nota10 : r.data.fecha;
    const va = get(a), vb = get(b);
    return dir * (typeof va === 'string' ? va.localeCompare(vb) : va - vb);
  });

  const hasGroups    = classResults.some(r => r.data.grupo);
  const hasManySheets = new Set(classResults.map(r => r.data.fichaId)).size > 1;
  const n    = classResults.length;
  const avg  = formatNum(classResults.reduce((s, r) => s + r.data.nota10, 0) / n);
  const pass = classResults.filter(r => r.data.nota10 >= 5).length;

  const arrow = c => c === col ? (dir > 0 ? ' ↑' : ' ↓') : ' ↕';
  const thSort = (c, label) => `<th data-sort="${c}" class="cl-sort">${esc(label)}${arrow(c)}</th>`;

  const rows = sorted.map((r, rowIdx) => {
    const d   = r.data;
    const cls = r.pct >= 70 ? 'score-high' : r.pct >= 50 ? 'score-mid' : 'score-low';
    const dup = classResults.filter(cr => cr.data.alumno === d.alumno && cr.data.fichaId === d.fichaId).length > 1;
    const badge = r.valid ? `<span class="vr-badge ok">✓</span>` : `<span class="vr-badge err">✗</span>`;
    return `<tr class="${cls}" data-ri="${r._i}">
      <td>${rowIdx + 1}</td>
      <td>${esc(d.alumno)}${dup ? `<span class="dup-warn" title="${esc(t('index.classDup'))}"> ⚠</span>` : ''}</td>
      ${hasGroups    ? `<td>${esc(d.grupo || '—')}</td>` : ''}
      ${hasManySheets ? `<td>${esc(d.titulo)}</td>` : ''}
      <td class="cl-num">${formatNum(d.nota10)}</td>
      <td class="cl-num">${r.pct}%</td>
      <td class="cl-date">${esc(fechaHora(new Date(d.fecha)))}</td>
      <td>${badge}</td>
    </tr>`;
  }).join('');

  const colspan = 7 + (hasGroups ? 1 : 0) + (hasManySheets ? 1 : 0);

  container.innerHTML = `
    <div class="class-toolbar">
      <span class="class-count">${n} ${n === 1 ? esc(t('index.classCountSing')) : esc(t('index.classCountPlur'))}</span>
      <div class="class-actions">
        <button class="btn small" id="btnExportCsv">${esc(t('index.btnExportCsv'))}</button>
        <button class="btn small" id="btnClearClass">${esc(t('index.btnClearClass'))}</button>
      </div>
    </div>
    <div class="class-table-wrap">
      <table class="class-table">
        <thead><tr>
          <th>#</th>
          ${thSort('alumno', t('entrega.student'))}
          ${hasGroups    ? thSort('grupo',  t('index.colGroup'))  : ''}
          ${hasManySheets ? thSort('titulo', t('entrega.sheet'))   : ''}
          ${thSort('nota10', t('index.colNota10'))}
          ${thSort('pct',    t('index.colPct'))}
          <th>${esc(t('entrega.date'))}</th>
          <th>${esc(t('index.colValid'))}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="${colspan}" class="class-stats">
          ${esc(t('index.classStats', { avg, pass, n }))}
        </td></tr></tfoot>
      </table>
    </div>`;

  container.querySelectorAll('th.cl-sort').forEach(th => {
    th.addEventListener('click', () => {
      const c = th.dataset.sort;
      classSort = { col: c, dir: classSort.col === c ? -classSort.dir : 1 };
      renderClassTable();
    });
  });

  container.querySelectorAll('tbody tr').forEach(tr => {
    tr.addEventListener('click', () => {
      const r = classResults[Number(tr.dataset.ri)];
      showDetail(r.data, r.valid);
    });
  });

  $('#btnExportCsv').addEventListener('click', exportClassCsv);
  $('#btnClearClass').addEventListener('click', () => {
    classResults.length = 0;
    saveClassResults();
    renderClassTable();
    const out = $('#salidaVerificacion');
    out.style.display = 'none';
    out.innerHTML = '';
  });
}

function exportClassCsv() {
  const BOM = '﻿', sep = ';';
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const headers = [
    t('entrega.student'), t('index.colGroup'), t('entrega.sheet'),
    t('entrega.date'), 'Punt.', 'Total',
    t('index.colNota10'), t('index.colPct'),
    t('index.colValid'), t('entrega.code')
  ].map(q).join(sep);
  const rows = classResults.map(r => {
    const d = r.data;
    return [
      d.alumno, d.grupo || '', d.titulo,
      fechaHora(new Date(d.fecha)),
      d.nota, d.total, d.nota10, r.pct,
      r.valid ? '✓' : '✗', d.codigo
    ].map(q).join(sep);
  });
  downloadBlob(
    new Blob([BOM + [headers, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' }),
    'resultados_clase.csv'
  );
}

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
  addToClass(data, res.valid);
  showDetail(data, res.valid);
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
  const files = [...e.dataTransfer.files].filter(f => f.name.endsWith('.json') || f.type === 'application/json');
  for (const file of files) {
    try { await processEntregaData(JSON.parse(await file.text())); }
    catch { showBadJson(); }
  }
});

// Restaurar lista guardada al arrancar
if (classResults.length) renderClassTable();

// Entrega recibida por URL (alumno compartió el enlace)
if (window.location.hash.startsWith('#e=')) {
  (async () => {
    try {
      const data = await decompressFromBase64url(window.location.hash.slice(3));
      await processEntregaData(data);
    } catch { showBadJson(); }
  })();
}
