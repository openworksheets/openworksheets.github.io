// Página de inicio: generador de enlaces para el alumnado y
// verificación de entregas.

import { toast, copyToClipboard, decompressFromBase64url, downloadBlob, fechaHora, formatNum } from './util.js';
import { buildShortLink, parseDriveId } from './drive.js';
import { verifyEntrega } from './entrega.js';
import { decryptSubmission, isEncryptedSubmission } from './submissionCrypto.js';
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

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatAnswer(val) {
  if (val === null || val === undefined || val === '') return '—';
  if (typeof val === 'string' && val.startsWith('data:')) return '🎙';
  if (Array.isArray(val)) return val.length ? val.map(String).join(' · ') : '—';
  if (typeof val === 'object') {
    const pairs = Object.entries(val).map(([k, v]) => `${k} → ${v}`);
    return pairs.length ? pairs.join(' · ') : '—';
  }
  return String(val) || '—';
}

// ---- Nota efectiva con la calificación manual del profesor ----
// El profesor puede poner la nota de los campos de grabación de voz «pendientes»
// al revisar la entrega. Esos ajustes se guardan en r.overrides (por id de
// campo) SIN tocar la entrega original del alumno (su firma sigue siendo válida).
// Las funciones eff* devuelven la nota teniendo en cuenta esos ajustes.
function effNota(r) {
  if (!r.overrides) return r.data.nota;
  const n = (r.data.respuestas || []).reduce(
    (s, resp) => s + Number(r.overrides[resp.id] ?? resp.puntos ?? 0), 0);
  return Math.round(n * 100) / 100;
}
function effNota10(r) {
  const total = r.data.total || 0;
  return total > 0 ? Math.round(effNota(r) / total * 1000) / 100 : 0;
}
function effPct(r) {
  const total = r.data.total || 0;
  return total > 0 ? Math.round(effNota(r) / total * 100) : 0;
}
function hasManualPending(data) {
  return (data.respuestas || []).some(r => r.tipo === 'record' && r.resultado === 'pendiente');
}

// HTML del badge de resultado de una respuesta. Si el profesor ya ha puesto
// nota manual (grabaciones), refleja esa nota (correcta/parcial/incorrecta)
// en vez del «pendiente» de la entrega original.
function resultBadgeHtml(r, resp) {
  const singKey = { correcta: 'entrega.correct', incorrecta: 'entrega.incorrect', parcial: 'entrega.partial', pendiente: 'entrega.pending', 'en blanco': 'entrega.blank' };
  const badgeCls = { correcta: 'ok', incorrecta: 'err', parcial: 'partial', pendiente: 'pending', 'en blanco': 'blank' };
  const iconMap = { correcta: '✓', incorrecta: '✗', parcial: '~', pendiente: '⋯', 'en blanco': '·' };
  let key;
  if (r.overrides && resp.id in r.overrides) {
    const max = Number(resp.maximo) || 0;
    const ratio = max > 0 ? Number(r.overrides[resp.id]) / max : 0;
    key = ratio >= 1 ? 'correcta' : ratio > 0 ? 'parcial' : 'incorrecta';
  } else {
    key = resp.resultado;
  }
  return `<span class="vr-badge ${badgeCls[key] || 'blank'}">${iconMap[key] || '·'} ${esc(t(singKey[key] || 'entrega.blank'))}</span>`;
}

function renderVerificacion(r) {
  const data = r.data;
  const valid = r.valid;

  const integridad = valid
    ? `<span class="vr-badge ok">${esc(t('verify.ok'))}</span>`
    : `<span class="vr-badge err">${esc(t('verify.tampered'))}</span>`;

  const rows = (data.respuestas || []).map((resp, i) => {
    const isRecord = resp.tipo === 'record';
    // Celda de respuesta: el audio se inserta tras volcar el HTML (data-fid).
    // Texto legible si la entrega lo trae (entregas nuevas, clave presente
    // aunque vacía → «—»); si no, se formatea la respuesta cruda (entregas
    // antiguas, sin respuestaTexto).
    const ansText = ('respuestaTexto' in resp) ? (resp.respuestaTexto || '—') : formatAnswer(resp.respuesta);
    const ansCell = isRecord
      ? `<td class="vr-ans vr-audio-cell" data-fid="${esc(resp.id)}"></td>`
      : `<td class="vr-ans">${esc(ansText)}</td>`;
    // Celda de puntos: editable cuando es grabación manual pendiente de nota.
    const manual = isRecord && resp.resultado === 'pendiente';
    const ptsVal = r.overrides && resp.id in r.overrides ? r.overrides[resp.id] : resp.puntos;
    const ptsCell = manual
      ? `<td class="vr-grade-cell"><input type="text" inputmode="decimal" class="vr-grade" data-fid="${esc(resp.id)}" data-max="${resp.maximo}" value="${formatNum(ptsVal)}"> / ${formatNum(resp.maximo)}</td>`
      : `<td style="white-space:nowrap">${formatNum(ptsVal)} / ${formatNum(resp.maximo)}</td>`;
    return `<tr>
      <td>${i + 1}</td>
      <td>${resp.pagina}</td>
      <td>${esc(t('field.' + resp.tipo) || resp.tipo)}</td>
      ${ansCell}
      ${ptsCell}
      <td class="vr-result-cell" data-fid="${esc(resp.id)}">${resultBadgeHtml(r, resp)}</td>
    </tr>`;
  }).join('');

  const gradeHint = hasManualPending(data)
    ? `<p class="vr-grade-hint">${esc(t('verify.gradeHint'))}</p>`
    : '';

  return `<div class="verify-card">
    <div class="verify-header">
      ${integridad}
      <div class="verify-meta" style="margin-top:8px">
        <strong>${esc(t('entrega.sheet'))}:</strong> ${esc(data.titulo)}<br>
        <strong>${esc(t('entrega.student'))}:</strong> ${esc(data.alumno)}${data.grupo ? ' (' + esc(data.grupo) + ')' : ''}<br>
        <strong>${esc(t('entrega.date'))}:</strong> ${esc(fechaHora(new Date(data.fecha)))}<br>
        <strong>${esc(t('entrega.score'))}:</strong> <span class="vr-score-val">${formatNum(effNota(r))} / ${formatNum(data.total)} &nbsp;(${formatNum(effNota10(r))} ${esc(t('entrega.over10'))})</span>
      </div>
    </div>
    ${gradeHint}
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

let classSaveWarned = false;
function saveClassResults() {
  try {
    localStorage.setItem(CLASS_STORAGE_KEY, JSON.stringify(classResults));
    classSaveWarned = false;
  } catch {
    // Cuota llena (las grabaciones de voz son data-URLs grandes): la lista sigue
    // en memoria pero ya no se persiste. Avisamos una vez para que el docente
    // exporte el CSV antes de recargar y perder las calificaciones.
    if (!classSaveWarned) {
      classSaveWarned = true;
      toast(t('toast.classSaveFailed'), 'error');
    }
  }
}

const classResults = loadClassResults();
let classSort = { col: 'fecha', dir: -1 };

function addToClass(data, valid) {
  const pct = data.total > 0 ? Math.round(data.nota / data.total * 100) : 0;
  const entry = { data, valid, pct };
  classResults.push(entry);
  saveClassResults();
  renderClassTable();
  return entry;
}

function showDetail(r) {
  const out = $('#salidaVerificacion');
  out.innerHTML = renderVerificacion(r);
  out.style.display = 'block';
  out.style.borderColor = r.valid ? 'var(--verde)' : 'var(--rojo)';
  out.style.background = r.valid ? 'var(--verde-claro)' : 'var(--rojo-claro)';
  if (!r.valid) {
    out.insertAdjacentHTML('afterbegin', `<p style="color:var(--rojo);font-weight:600;margin-bottom:8px">✗ ${esc(t('verify.tampered'))}</p>`);
  }

  // Inserta el reproductor de audio de cada grabación (la respuesta es un data-URL).
  out.querySelectorAll('.vr-audio-cell').forEach(td => {
    const resp = (r.data.respuestas || []).find(x => String(x.id) === td.dataset.fid);
    const url = resp && typeof resp.respuesta === 'string' && resp.respuesta.startsWith('data:') ? resp.respuesta : '';
    if (url) {
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.src = url;
      audio.preload = 'metadata';
      audio.className = 'vr-audio';
      td.appendChild(audio);
    } else {
      td.textContent = '—';
    }
  });

  // Calificación manual: el profesor edita los puntos de cada grabación pendiente.
  const scoreEl = out.querySelector('.vr-score-val');
  const refreshScore = () => {
    if (scoreEl) scoreEl.innerHTML = `${formatNum(effNota(r))} / ${formatNum(r.data.total)} &nbsp;(${formatNum(effNota10(r))} ${esc(t('entrega.over10'))})`;
    renderClassTable();
  };
  out.querySelectorAll('.vr-grade').forEach(inp => {
    const max = parseFloat(inp.dataset.max) || 0;
    const apply = (normalize) => {
      let v = parseFloat(String(inp.value).replace(',', '.'));
      if (isNaN(v)) v = 0;
      v = Math.max(0, Math.min(max, v));
      r.overrides = r.overrides || {};
      r.overrides[inp.dataset.fid] = v;
      if (normalize) inp.value = formatNum(v);
      // Actualiza el badge de resultado de esa fila para que deje de poner «pendiente».
      const cell = out.querySelector(`.vr-result-cell[data-fid="${inp.dataset.fid}"]`);
      if (cell) cell.innerHTML = resultBadgeHtml(r, { id: inp.dataset.fid, maximo: max });
      saveClassResults();
      refreshScore();
    };
    inp.addEventListener('input', () => apply(false));
    inp.addEventListener('change', () => apply(true));
  });

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
      col === 'pct'    ? effPct(r) :
      col === 'nota10' ? effNota10(r) : r.data.fecha;
    const va = get(a), vb = get(b);
    return dir * (typeof va === 'string' ? va.localeCompare(vb) : va - vb);
  });

  const hasGroups    = classResults.some(r => r.data.grupo);
  const hasManySheets = new Set(classResults.map(r => r.data.fichaId)).size > 1;
  const n    = classResults.length;
  const avg  = formatNum(classResults.reduce((s, r) => s + effNota10(r), 0) / n);
  const pass = classResults.filter(r => effNota10(r) >= 5).length;

  const arrow = c => c === col ? (dir > 0 ? ' ↑' : ' ↓') : ' ↕';
  const thSort = (c, label, right = false) => `<th data-sort="${c}" class="cl-sort${right ? ' cl-num' : ''}">${esc(label)}${arrow(c)}</th>`;

  const rows = sorted.map((r, rowIdx) => {
    const d   = r.data;
    const pct = effPct(r);
    const cls = pct >= 70 ? 'score-high' : pct >= 50 ? 'score-mid' : 'score-low';
    const dup = classResults.filter(cr => cr.data.alumno === d.alumno && cr.data.fichaId === d.fichaId).length > 1;
    const badge = r.valid ? `<span class="vr-badge ok">✓</span>` : `<span class="vr-badge err">✗</span>`;
    const pend = hasManualPending(d) ? `<span class="cl-pending" title="${esc(t('index.pendingTip'))}"> ⋯</span>` : '';
    return `<tr class="${cls}" data-ri="${r._i}">
      <td>${rowIdx + 1}</td>
      <td>${esc(d.alumno)}${dup ? `<span class="dup-warn" title="${esc(t('index.classDup'))}"> ⚠</span>` : ''}</td>
      ${hasGroups    ? `<td>${esc(d.grupo || '—')}</td>` : ''}
      ${hasManySheets ? `<td>${esc(d.titulo)}</td>` : ''}
      <td class="cl-num">${formatNum(effNota10(r))}${pend}</td>
      <td class="cl-num">${pct}%</td>
      <td class="cl-date">${esc(fechaHora(new Date(d.fecha)))}</td>
      <td class="cl-num">${badge}</td>
      <td class="cl-del"><button class="cl-del-btn" data-ri="${r._i}" title="${esc(t('index.delRow'))}">✕</button></td>
    </tr>`;
  }).join('');

  const colspan = 8 + (hasGroups ? 1 : 0) + (hasManySheets ? 1 : 0);

  container.innerHTML = `
    <div class="class-toolbar">
      <span class="class-count">${n} ${n === 1 ? esc(t('index.classCountSing')) : esc(t('index.classCountPlur'))}</span>
      <div class="class-actions">
        <button class="btn small" id="btnCopyCsv">${esc(t('index.btnCopyCsv'))}</button>
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
          ${thSort('nota10', t('index.colNota10'), true)}
          ${thSort('pct',    t('index.colPct'),    true)}
          <th>${esc(t('entrega.date'))}</th>
          <th class="cl-num">${esc(t('index.colValid'))}</th>
          <th></th>
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
    tr.addEventListener('click', e => {
      if (e.target.closest('.cl-del-btn')) return;
      showDetail(classResults[Number(tr.dataset.ri)]);
    });
  });

  container.querySelectorAll('.cl-del-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const ri = Number(btn.dataset.ri);
      classResults.splice(ri, 1);
      saveClassResults();
      renderClassTable();
    });
  });

  $('#btnCopyCsv').addEventListener('click', copyClassCsv);
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

function buildClassCsv() {
  const sep = ';';
  // Neutraliza la inyección de fórmulas (CSV injection): un alumno podría
  // ponerse de nombre «=HYPERLINK(...)» o «=1+1» y la fórmula se ejecutaría al
  // abrir el docente el CSV en Excel/LibreOffice. Se antepone un apóstrofo a las
  // celdas que empiezan por un carácter de fórmula para forzar texto literal.
  const q = v => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };
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
      effNota(r), d.total, effNota10(r), effPct(r),
      r.valid ? '✓' : '✗', d.codigo
    ].map(q).join(sep);
  });
  return [headers, ...rows].join('\n');
}

function exportClassCsv() {
  const BOM = '﻿';
  downloadBlob(
    new Blob([BOM + buildClassCsv()], { type: 'text/csv;charset=utf-8' }),
    'resultados_clase.csv'
  );
}

async function copyClassCsv() {
  const ok = await copyToClipboard(buildClassCsv());
  toast(ok ? t('toast.copied') : t('toast.notCopied'), ok ? 'ok' : 'error');
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
  const entry = addToClass(data, res.valid);
  showDetail(entry);
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
