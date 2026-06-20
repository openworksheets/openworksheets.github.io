// Panel de «resultados de clase»: acumula entregas verificadas en una tabla con
// resumen y exportación CSV, persistida en localStorage. Lo comparten la página
// de inicio (index.js) y la página web autónoma exportada (webrun.js), de modo
// que un docente puede corregir un curso entero desde su propio sitio.
//
//   createClassPanel({ tableEl, detailEl, storageKey, csvFilename })
//     .addEntrega(data, valid)  → añade, persiste, re-renderiza y muestra el detalle
//     .render()                 → re-renderiza la tabla (p. ej. al arrancar)
//     .count()                  → nº de entregas acumuladas

import { fechaHora, formatNum, downloadBlob, copyToClipboard, toast } from './util.js';
import { t } from './i18n.js';
import {
  renderVerificacion, mountVerificacion, esc,
  effNota, effNota10, effPct, hasManualPending
} from './verifyview.js';

export function createClassPanel({ tableEl, detailEl, storageKey = 'openworksheets:classResults', csvFilename = 'resultados_clase.csv' }) {
  let classResults = load();
  let classSort = { col: 'fecha', dir: -1 };
  let saveWarned = false;

  function load() {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(classResults));
      saveWarned = false;
    } catch {
      // Cuota llena (las grabaciones de voz son data-URLs grandes): la lista sigue
      // en memoria pero ya no se persiste. Avisamos una vez para que el docente
      // exporte el CSV antes de recargar y perder las calificaciones.
      if (!saveWarned) {
        saveWarned = true;
        toast(t('toast.classSaveFailed'), 'error');
      }
    }
  }

  function addEntrega(data, valid) {
    const pct = data.total > 0 ? Math.round(data.nota / data.total * 100) : 0;
    const entry = { data, valid, pct };
    classResults.push(entry);
    save();
    render();
    return entry;
  }

  function hideDetail() {
    detailEl.style.display = 'none';
    detailEl.innerHTML = '';
  }

  // El detalle de una entrega solo se muestra al pulsar su fila en la tabla; se
  // cierra con su botón ✕.
  function showDetail(r) {
    detailEl.innerHTML = renderVerificacion(r);
    detailEl.style.position = 'relative';
    detailEl.style.display = 'block';
    detailEl.style.borderColor = r.valid ? 'var(--verde)' : 'var(--rojo)';
    detailEl.style.background = r.valid ? 'var(--verde-claro)' : 'var(--rojo-claro)';
    if (!r.valid) {
      detailEl.insertAdjacentHTML('afterbegin', `<p style="color:var(--rojo);font-weight:600;margin-bottom:8px">✗ ${esc(t('verify.tampered'))}</p>`);
    }
    mountVerificacion(detailEl, r, { onGradeChange: () => { save(); render(); } });
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'vr-close';
    closeBtn.title = t('dlg.close');
    closeBtn.setAttribute('aria-label', t('dlg.close'));
    closeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
    closeBtn.addEventListener('click', hideDetail);
    detailEl.appendChild(closeBtn);
    detailEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function render() {
    if (classResults.length === 0) { tableEl.style.display = 'none'; return; }
    tableEl.style.display = 'block';

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
      // Marca de supervisión: el alumno salió de la pantalla completa o cambió de
      // ventana/pestaña. Destaca la fila para que el profesor la revise.
      const flagged = d.vigilancia && d.vigilancia.count > 0;
      const flag = flagged
        ? `<span class="cl-flag" title="${esc(t('index.monitorTip', { n: d.vigilancia.count }) + (d.vigilancia.forcedSubmit ? ' · ' + t('entrega.monitorForced') : ''))}">👁</span>`
        : '';
      return `<tr class="${cls}${flagged ? ' cl-flagged' : ''}" data-ri="${r._i}">
        <td>${rowIdx + 1}</td>
        <td>${esc(d.alumno)}${dup ? `<span class="dup-warn" title="${esc(t('index.classDup'))}"> ⚠</span>` : ''}${flag}</td>
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

    tableEl.innerHTML = `
      <div class="class-toolbar">
        <span class="class-count">${n} ${n === 1 ? esc(t('index.classCountSing')) : esc(t('index.classCountPlur'))}</span>
        <div class="class-actions">
          <button class="btn small" data-act="copy">${esc(t('index.btnCopyCsv'))}</button>
          <button class="btn small" data-act="export">${esc(t('index.btnExportCsv'))}</button>
          <button class="btn small" data-act="clear">${esc(t('index.btnClearClass'))}</button>
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

    tableEl.querySelectorAll('th.cl-sort').forEach(th => {
      th.addEventListener('click', () => {
        const c = th.dataset.sort;
        classSort = { col: c, dir: classSort.col === c ? -classSort.dir : 1 };
        render();
      });
    });

    tableEl.querySelectorAll('tbody tr').forEach(tr => {
      tr.addEventListener('click', e => {
        if (e.target.closest('.cl-del-btn')) return;
        showDetail(classResults[Number(tr.dataset.ri)]);
      });
    });

    tableEl.querySelectorAll('.cl-del-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        classResults.splice(Number(btn.dataset.ri), 1);
        save();
        render();
      });
    });

    tableEl.querySelector('[data-act="copy"]').addEventListener('click', copyCsv);
    tableEl.querySelector('[data-act="export"]').addEventListener('click', exportCsv);
    tableEl.querySelector('[data-act="clear"]').addEventListener('click', () => {
      classResults.length = 0;
      save();
      render();
      hideDetail();
    });
  }

  function buildCsv() {
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

  function exportCsv() {
    const BOM = '﻿';
    downloadBlob(new Blob([BOM + buildCsv()], { type: 'text/csv;charset=utf-8' }), csvFilename);
  }

  async function copyCsv() {
    const ok = await copyToClipboard(buildCsv());
    toast(ok ? t('toast.copied') : t('toast.notCopied'), ok ? 'ok' : 'error');
  }

  return { addEntrega, render, count: () => classResults.length };
}
