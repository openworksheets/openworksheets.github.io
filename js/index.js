// Página de inicio: generador de enlaces para el alumnado y
// verificación de entregas.

import { toast, copyToClipboard, fechaHora, formatNum } from './util.js';
import { buildStudentLink, parseDriveId } from './drive.js';
import { verifyEntrega } from './entrega.js';
import { t, applyI18n, initLangSelector } from './i18n.js';

applyI18n();
initLangSelector();

const $ = s => document.querySelector(s);

// --- Generar enlace ---

$('#btnGenerar').addEventListener('click', async () => {
  const url = $('#urlZip').value.trim();
  if (!url) { toast(t('toast.pasteUrl'), 'error'); return; }
  if (!/^https?:\/\//i.test(url)) { toast(t('toast.invalidUrl'), 'error'); return; }
  if (/drive\.google\.com/.test(url) && !parseDriveId(url)) {
    toast(t('toast.driveError'), 'error');
    return;
  }
  const link = buildStudentLink(url);
  $('#enlaceAlumnos').textContent = link;
  $('#salidaEnlace').style.display = 'block';
  const ok = await copyToClipboard(link);
  if (ok) toast(t('toast.linkCopied'), 'ok');
});

$('#btnCopiarEnlace').addEventListener('click', async () => {
  const ok = await copyToClipboard($('#enlaceAlumnos').textContent);
  toast(ok ? t('toast.copied') : t('toast.notCopied'), ok ? 'ok' : 'error');
});

// --- Verificar entrega ---

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
        <strong>${esc(t('entrega.score'))}:</strong> ${formatNum(data.nota)} / ${formatNum(data.total)} &nbsp;(${formatNum(data.nota10)} ${esc(t('entrega.over10'))})<br>
        <strong>${esc(t('entrega.code'))}:</strong> <code>${esc(data.codigo)}</code>
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

$('#btnVerificar').addEventListener('click', () => $('#inputEntrega').click());

$('#inputEntrega').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const out = $('#salidaVerificacion');
  try {
    const data = JSON.parse(await file.text());
    const res = await verifyEntrega(data);
    out.innerHTML = renderVerificacion(data, res.valid);
    out.style.display = 'block';
    out.style.borderColor = res.valid ? 'var(--verde)' : 'var(--rojo)';
    out.style.background = res.valid ? 'var(--verde-claro)' : 'var(--rojo-claro)';
    if (!res.valid) {
      out.insertAdjacentHTML('afterbegin', `<p style="color:var(--rojo);font-weight:600;margin-bottom:8px">✗ ${esc(res.reason)}</p>`);
    }
  } catch {
    out.textContent = t('verify.badJson');
    out.style.display = 'block';
    out.style.borderColor = 'var(--rojo)';
    out.style.background = 'var(--rojo-claro)';
  }
});
