// Render de la verificación de una entrega individual (tarjeta con integridad,
// datos del alumno, tabla de respuestas, audio de las grabaciones y, si las hay,
// calificación manual de las grabaciones pendientes).
//
// Lo comparten la página de inicio (index.js, con su tabla de clase) y la página
// web autónoma exportada (webrun.js, al abrir un enlace de entrega «#e=»).

import { fechaHora, formatNum } from './util.js';
import { t } from './i18n.js';

export function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
export function effNota(r) {
  if (!r.overrides) return r.data.nota;
  const n = (r.data.respuestas || []).reduce(
    (s, resp) => s + Number(r.overrides[resp.id] ?? resp.puntos ?? 0), 0);
  return Math.round(n * 100) / 100;
}
export function effNota10(r) {
  const total = r.data.total || 0;
  return total > 0 ? Math.round(effNota(r) / total * 1000) / 100 : 0;
}
export function effPct(r) {
  const total = r.data.total || 0;
  return total > 0 ? Math.round(effNota(r) / total * 100) : 0;
}
export function hasManualPending(data) {
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

// HTML de la tarjeta de verificación de una entrega. r = { data, valid, overrides? }.
export function renderVerificacion(r) {
  const data = r.data;
  const valid = r.valid;

  const integridad = valid
    ? `<span class="vr-badge ok">${esc(t('verify.ok'))}</span>`
    : `<span class="vr-badge err">${esc(t('verify.tampered'))}</span>`;

  const rows = (data.respuestas || []).map((resp, i) => {
    const isRecord = resp.tipo === 'record';
    const ansText = ('respuestaTexto' in resp) ? (resp.respuestaTexto || '—') : formatAnswer(resp.respuesta);
    const ansCell = isRecord
      ? `<td class="vr-ans vr-audio-cell" data-fid="${esc(resp.id)}"></td>`
      : `<td class="vr-ans">${esc(ansText)}</td>`;
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

// Activa la tarjeta ya volcada en `container`: inserta los reproductores de
// audio de las grabaciones y engancha los campos de calificación manual. Cada
// cambio actualiza la nota y el badge de la fila; `onGradeChange(r)` (opcional)
// se llama para persistir donde haga falta (la tabla de clase en index.js).
export function mountVerificacion(container, r, { onGradeChange } = {}) {
  container.querySelectorAll('.vr-audio-cell').forEach(td => {
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

  const scoreEl = container.querySelector('.vr-score-val');
  const refreshScore = () => {
    if (scoreEl) scoreEl.innerHTML = `${formatNum(effNota(r))} / ${formatNum(r.data.total)} &nbsp;(${formatNum(effNota10(r))} ${esc(t('entrega.over10'))})`;
  };
  container.querySelectorAll('.vr-grade').forEach(inp => {
    const max = parseFloat(inp.dataset.max) || 0;
    const apply = (normalize) => {
      let v = parseFloat(String(inp.value).replace(',', '.'));
      if (isNaN(v)) v = 0;
      v = Math.max(0, Math.min(max, v));
      r.overrides = r.overrides || {};
      r.overrides[inp.dataset.fid] = v;
      if (normalize) inp.value = formatNum(v);
      const cell = container.querySelector(`.vr-result-cell[data-fid="${inp.dataset.fid}"]`);
      if (cell) cell.innerHTML = resultBadgeHtml(r, { id: inp.dataset.fid, maximo: max });
      refreshScore();
      if (onGradeChange) onGradeChange(r);
    };
    inp.addEventListener('input', () => apply(false));
    inp.addEventListener('change', () => apply(true));
  });
}
