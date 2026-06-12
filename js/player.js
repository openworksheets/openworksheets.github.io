// Visor de fichas en modo alumno. También lo usa el editor como vista previa.
//
// mountPlayer(rootEl, ficha, opts)
//   ficha = { manifest, files: Map<ruta, Blob> }
//   opts  = { preview: bool }

import { el, toast, mulberry32, formatNum, downloadBlob, copyToClipboard, fechaHora, zoomControl } from './util.js';
import { isDecorField } from './fieldtypes.js';
import { renderField } from './render.js';
import { gradeField, expectedText } from './grading.js';
import { buildEntrega, entregaFilename, entregaResumen } from './entrega.js';
import { t } from './i18n.js';

function formatCountdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(s / 86400);
  const pad = n => String(n).padStart(2, '0');
  const hms = pad(Math.floor((s % 86400) / 3600)) + ':' + pad(Math.floor((s % 3600) / 60)) + ':' + pad(s % 60);
  return d > 0 ? d + 'd ' + hms : hms;
}

export function mountPlayer(rootEl, ficha, opts = {}) {
  const { manifest, files } = ficha;
  const settings = manifest.settings || {};
  const access = manifest.access || {};
  const preview = Boolean(opts.preview);
  const storageKey = 'workpdf:al:' + manifest.id;

  const urls = new Map();
  function fileUrl(path) {
    if (!urls.has(path)) urls.set(path, URL.createObjectURL(files.get(path)));
    return urls.get(path);
  }

  const gradable = f => !isDecorField(f.type) && !f.noScore;
  const totalPoints = manifest.pages.reduce(
    (sum, p) => sum + p.fields.filter(gradable).reduce((s, f) => s + (Number(f.points) || 0), 0), 0);
  const totalFields = manifest.pages.reduce((s, p) => s + p.fields.filter(gradable).length, 0);

  let state = loadState();
  let controllers = [];
  let finished = false;
  let cronoTimer = null;
  let aperturaTimer = null;

  function loadState() {
    if (preview) return null;
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function saveState(extra = {}) {
    if (preview) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        alumno: datos.alumno,
        grupo: datos.grupo,
        seed: datos.seed,
        attempts: datos.attempts,
        startedAt: datos.startedAt || 0,
        answers: collectAnswers(),
        lastEntrega: datos.lastEntrega || null,
        ...extra
      }));
    } catch { /* almacenamiento no disponible */ }
  }

  function clearAnswersState() {
    if (preview) return;
    try {
      const st = loadState() || {};
      delete st.answers;
      localStorage.setItem(storageKey, JSON.stringify({ ...st, seed: datos.seed }));
    } catch { /* nada */ }
  }

  const datos = {
    alumno: state?.alumno || '',
    grupo: state?.grupo || '',
    seed: state?.seed || ((Math.random() * 2 ** 31) | 0),
    attempts: state?.attempts || 0,
    startedAt: state?.startedAt || 0,
    lastEntrega: state?.lastEntrega || null
  };

  function collectAnswers() {
    const out = {};
    controllers.forEach(c => { out[c.field.id] = c.getAnswer(); });
    return out;
  }

  function attemptsLeft() {
    const max = Number(settings.maxAttempts) || 0;
    if (max <= 0) return Infinity;
    return Math.max(0, max - datos.attempts);
  }

  // ---------- Restricciones de acceso ----------

  function accessState() {
    if (preview) return 'ok';
    if (access.desde && Date.now() < Date.parse(access.desde)) return 'before';
    if (access.hasta && Date.now() > Date.parse(access.hasta)) return 'after';
    return 'ok';
  }

  function showNotYet() {
    rootEl.textContent = '';
    const cuenta = el('div', { style: 'font-size:1.5rem;font-weight:700;font-variant-numeric:tabular-nums;margin-top:10px' });
    rootEl.appendChild(el('div', { class: 'al-centro' },
      el('div', { class: 'card al-tarjeta' },
        el('div', { class: 'icono' }, '⏳'),
        el('h1', {}, t('player.notYet')),
        el('p', {}, t('player.notYetDesc', { fecha: fechaHora(new Date(access.desde)) })),
        cuenta)));
    function tick() {
      const left = Date.parse(access.desde) - Date.now();
      if (left <= 0) { clearInterval(aperturaTimer); showStart(); return; }
      cuenta.textContent = formatCountdown(left);
    }
    clearInterval(aperturaTimer);
    aperturaTimer = setInterval(tick, 1000);
    tick();
  }

  function showClosed() {
    rootEl.textContent = '';
    rootEl.appendChild(el('div', { class: 'al-centro' },
      el('div', { class: 'card al-tarjeta' },
        el('div', { class: 'icono' }, '✕'),
        el('h1', {}, t('player.closed')),
        el('p', {}, t('player.closedDesc', { fecha: fechaHora(new Date(access.hasta)) })))));
  }

  // ---------- Pantalla de identificación ----------

  function showStart() {
    rootEl.textContent = '';
    if (preview) { startActivity('Vista previa', ''); return; }

    const st = accessState();
    if (st === 'before') { showNotYet(); return; }
    if (st === 'after') { showClosed(); return; }

    if (attemptsLeft() <= 0) { showBlocked(); return; }

    const nombre = el('input', { type: 'text', autocomplete: 'name', required: '' });
    const grupo = el('input', { type: 'text' });
    nombre.value = datos.alumno;
    grupo.value = datos.grupo;
    const passInput = access.password
      ? el('input', { type: 'password', autocomplete: 'off' })
      : null;

    const form = el('form', {},
      el('label', { class: 'f-label' }, t('player.nameLabel')), nombre,
      el('label', { class: 'f-label' }, t('player.groupLabel')), grupo,
      passInput ? el('label', { class: 'f-label' }, t('player.passwordLabel')) : null,
      passInput,
      el('div', { style: 'margin-top:18px;text-align:center' },
        el('button', { class: 'btn primary', type: 'submit' }, t('player.startBtn'))));
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (!nombre.value.trim()) { toast(t('player.enterName'), 'error'); return; }
      if (accessState() === 'after') { showClosed(); return; }
      if (passInput && passInput.value !== access.password) {
        toast(t('player.passwordWrong'), 'error');
        return;
      }
      startActivity(nombre.value.trim(), grupo.value.trim());
    });

    const pn = manifest.pages.length, fn = totalFields, pp = totalPoints;
    const restored = state && state.answers && Object.keys(state.answers).length;
    rootEl.appendChild(el('div', { class: 'al-centro' },
      el('div', { class: 'card al-tarjeta anim-in' },
        el('h1', {}, manifest.title || 'WorkPDF'),
        manifest.author ? el('p', { class: 'quien' }, t('player.authorPrefix') + manifest.author) : null,
        el('p', {}, t('player.statsLine', { pages: pn, ps: pn === 1 ? '' : 's', fields: fn, fs: fn === 1 ? '' : 's', points: formatNum(pp), pts: pp === 1 ? '' : 's' })),
        access.hasta ? el('p', {}, t('player.untilInfo', { fecha: fechaHora(new Date(access.hasta)) })) : null,
        Number(access.tiempoLimite) > 0 ? el('p', {}, t('player.timeLimitInfo', { min: access.tiempoLimite })) : null,
        restored ? el('p', { style: 'color:var(--verde);font-weight:700' }, t('player.savedProgress')) : null,
        Number(settings.maxAttempts) > 0
          ? el('p', {}, t('player.attemptsLeft', { left: attemptsLeft(), max: settings.maxAttempts }))
          : null,
        form)));
  }

  function showBlocked() {
    rootEl.textContent = '';
    const last = datos.lastEntrega;
    rootEl.appendChild(el('div', { class: 'al-centro' },
      el('div', { class: 'card al-tarjeta' },
        el('div', { class: 'icono' }, '✕'),
        el('h1', {}, t('player.noAttempts')),
        el('p', {}, t('player.noAttemptsDesc')),
        last ? el('p', {}, t('player.lastScore', { nota: formatNum(last.nota), total: formatNum(last.total), code: last.codigo })) : null,
        last ? el('div', { style: 'display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:10px' },
          el('button', { class: 'btn', onclick: () => downloadEntrega(last) }, t('player.downloadBtn')),
          el('button', { class: 'btn', onclick: () => copyResumen(last) }, t('player.copyBtn'))) : null)));
  }

  // ---------- Actividad ----------

  function startActivity(alumno, grupo) {
    datos.alumno = alumno;
    datos.grupo = grupo;
    finished = false;
    controllers = [];
    rootEl.textContent = '';

    const rng = mulberry32(datos.seed);
    const doc = el('div', { class: 'al-doc' });

    doc.appendChild(el('div', { class: 'al-cabecera' },
      el('h1', {}, manifest.title || 'WorkPDF'),
      el('span', { class: 'quien' },
        preview ? t('player.previewLabel') : `${alumno}${grupo ? ' · ' + grupo : ''}`)));

    if (manifest.instructions) {
      doc.appendChild(el('div', { class: 'al-instrucciones' }, manifest.instructions));
    }

    const ctx = {
      rng,
      shuffle: Boolean(settings.shuffle),
      onChange: () => { updateProgress(); scheduleSave(); },
      fileUrl
    };

    manifest.pages.forEach((page, pi) => {
      const pageEl = el('div', { class: 'wpf-page' },
        el('img', { class: 'fondo', src: fileUrl(page.image), alt: 'Página ' + (pi + 1) }));
      page.fields.forEach(field => {
        const ctl = renderField(field, pageEl, ctx);
        if (!gradable(field)) return; // decorativos o noScore: se muestran pero no puntúan
        ctl.pageIndex = pi;
        controllers.push(ctl);
      });
      doc.appendChild(pageEl);
    });

    // Plazo efectivo del intento: tiempo límite y/o cierre con auto-entrega
    clearInterval(cronoTimer);
    let deadline = 0;
    if (!preview) {
      if (Number(access.tiempoLimite) > 0) {
        if (!datos.startedAt) { datos.startedAt = Date.now(); saveState(); }
        deadline = datos.startedAt + Number(access.tiempoLimite) * 60000;
      }
      if (access.hasta && access.autoEntrega) {
        const end = Date.parse(access.hasta);
        if (!isNaN(end)) deadline = deadline ? Math.min(deadline, end) : end;
      }
    }

    // Barra inferior
    const progTxt = el('span', {}, '');
    const progBar = el('div', {});
    const crono = el('span', { class: 'al-crono' });
    const btnFin = el('button', { class: 'btn primary' }, t('player.finishBtn'));
    btnFin.addEventListener('click', confirmFinish);
    const zoom = zoomControl({
      apply: z => doc.style.setProperty('--zoom', z),
      key: 'wpf-al-zoom',
      titles: { in: t('zoom.in'), out: t('zoom.out'), reset: t('zoom.reset') }
    });
    doc.addEventListener('wheel', e => {
      if (!e.ctrlKey) return; // Ctrl+rueda (o pellizco en el panel táctil)
      e.preventDefault();
      zoom.set(zoom.get() * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
    }, { passive: false });
    const barra = el('div', { class: 'al-barra' },
      el('div', { class: 'estado' }, progTxt, el('div', { class: 'mini-prog' }, progBar)),
      zoom.el,
      deadline ? crono : null,
      btnFin);
    rootEl.appendChild(doc);
    rootEl.appendChild(barra);

    // Restaurar respuestas guardadas
    if (!preview && state?.answers) {
      controllers.forEach(c => {
        if (c.field.id in state.answers) {
          try { c.setAnswer(state.answers[c.field.id]); } catch { /* respuesta incompatible */ }
        }
      });
    }
    updateProgress();

    // Cuenta atrás: aviso a 5 minutos y entrega automática al agotarse
    if (deadline) {
      let warned = false;
      const tick = () => {
        const left = deadline - Date.now();
        if (left <= 0) {
          clearInterval(cronoTimer);
          if (!finished) {
            toast(t('player.autoSubmitted'), 'error');
            finish(doc, barra, btnFin);
          }
          return;
        }
        crono.textContent = '⏱ ' + formatCountdown(left);
        crono.classList.toggle('urgente', left < 5 * 60000);
        if (!warned && left <= 5 * 60000) {
          warned = true;
          toast(t('player.timeWarning', { min: Math.ceil(left / 60000) }), 'error');
        }
      };
      cronoTimer = setInterval(tick, 1000);
      tick();
    }

    let saveTimer = null;
    function scheduleSave() {
      if (preview) return;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => saveState(), 400);
    }

    function updateProgress() {
      const done = controllers.filter(c => c.isAnswered()).length;
      progTxt.textContent = t('player.progress', { done, total: controllers.length });
      progBar.style.width = controllers.length ? (done / controllers.length * 100) + '%' : '0%';
    }

    function confirmFinish() {
      if (finished) return;
      const pending = controllers.filter(c => !c.isAnswered()).length;
      const msg = pending > 0
        ? t('player.confirmPending', { n: pending, s: pending === 1 ? '' : 's' })
        : t('player.confirmFinish');
      if (window.confirm(msg)) finish(doc, barra, btnFin);
    }
  }

  // ---------- Corrección ----------

  async function finish(doc, barra, btnFin) {
    finished = true;
    clearInterval(cronoTimer);
    btnFin.disabled = true;

    const resultados = [];
    let earned = 0;
    controllers.forEach(c => {
      const res = gradeField(c.field, c.getAnswer());
      earned += res.earned;
      c.setDisabled(true);
      if (settings.showCorrection !== false) {
        c.mark(res, expectedText(c.field));
      }
      resultados.push({
        id: c.field.id,
        type: c.field.type,
        page: c.pageIndex + 1,
        answer: c.getAnswer(),
        earned: res.earned,
        max: res.max,
        ok: res.ok
      });
    });
    earned = Math.round(earned * 100) / 100;

    const entrega = await buildEntrega({
      manifest,
      alumno: datos.alumno,
      grupo: datos.grupo,
      resultados,
      earned,
      total: totalPoints
    });

    if (!preview) {
      datos.attempts += 1;
      datos.startedAt = 0;
      datos.lastEntrega = {
        nota: entrega.nota, total: entrega.total, codigo: entrega.codigo, fecha: entrega.fecha
      };
      saveState();
      clearAnswersState();
    }

    // Tarjeta de resultados
    const nota10 = entrega.nota10;
    const showScore = settings.showScore !== false;
    const acciones = el('div', { class: 'acciones' });
    acciones.appendChild(el('button', { class: 'btn dark', onclick: () => downloadEntrega(entrega) }, t('player.downloadBtn')));
    acciones.appendChild(el('button', { class: 'btn', onclick: () => copyResumen(entrega) }, t('player.copyBtn')));
    if (preview || attemptsLeft() > 0) {
      acciones.appendChild(el('button', {
        class: 'btn', onclick: () => {
          if (!preview && accessState() === 'after') { showClosed(); return; }
          datos.seed = (Math.random() * 2 ** 31) | 0;
          datos.startedAt = 0;
          state = null;
          if (!preview) saveState();
          startActivity(datos.alumno, datos.grupo);
          window.scrollTo({ top: 0 });
        }
      }, t('player.retryBtn')));
    }

    const tarjeta = el('div', { class: 'al-resultado anim-in' },
      el('h2', {}, preview ? t('player.resultTitlePreview') : t('player.resultTitle')),
      showScore
        ? el('div', { class: 'notaza' + (totalPoints > 0 && entrega.nota / totalPoints >= 0.5 ? ' bien' : '') },
            `${formatNum(entrega.nota)} / ${formatNum(entrega.total)}`)
        : el('p', {}, t('player.teacherCheck')),
      showScore ? el('div', { class: 'detalle' }, t('player.equiv', { nota: formatNum(nota10) })) : null,
      el('div', { class: 'detalle' },
        `${datos.alumno}${datos.grupo ? ' · ' + datos.grupo : ''} · ${fechaHora(new Date(entrega.fecha))} · ${t('entrega.code')}: `,
        el('span', { class: 'codigo' }, entrega.codigo)),
      el('p', { style: 'margin-top:12px' }, t('player.submissionInfo')),
      acciones);

    if (showScore && totalPoints > 0) {
      const pct = Math.round(entrega.nota / totalPoints * 100);
      tarjeta.querySelector('.detalle').append(t('player.pct', { pct }));
    }

    doc.insertBefore(tarjeta, doc.firstChild);
    barra.remove();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function downloadEntrega(entrega) {
    const blob = new Blob([JSON.stringify(entrega, null, 2)], { type: 'application/json' });
    downloadBlob(blob, entregaFilename(entrega));
  }

  async function copyResumen(entrega) {
    const ok = await copyToClipboard(entregaResumen(entrega));
    toast(ok ? t('toast.resumeCopied') : t('toast.resumeError'), ok ? 'ok' : 'error');
  }

  showStart();

  return {
    destroy() {
      clearInterval(cronoTimer);
      clearInterval(aperturaTimer);
      urls.forEach(u => URL.revokeObjectURL(u));
      urls.clear();
      rootEl.textContent = '';
    }
  };
}
