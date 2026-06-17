// Visor de fichas en modo alumno. También lo usa el editor como vista previa.
//
// mountPlayer(rootEl, ficha, opts)
//   ficha = { manifest, files: Map<ruta, Blob> }
//   opts  = { preview: bool }

import { el, toast, mulberry32, formatNum, downloadBlob, copyToClipboard, compressToBase64url, fechaHora, zoomControl } from './util.js';
import { ICONS } from './icons.js';

function iconBtn(attrs, svgStr, label) {
  const b = el('button', attrs);
  b.innerHTML = svgStr + (label ? ' <span>' + label + '</span>' : '');
  return b;
}
import { isDecorField } from './fieldtypes.js';
import { renderField } from './render.js';
import { fontStack } from './fonts.js';
import { gradeField, expectedText, answerText } from './grading.js';
import { buildEntregaData, entregaFilename, entregaResumen } from './entrega.js';
import { encryptSubmission } from './submissionCrypto.js';
import { scormSupported, registerScormSw, provisionScormPackage, scormRunBase } from './scormhost.js';
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
  // Modo SCORM: la ficha corre dentro de un LMS. La nota se reporta vía
  // opts.onGraded; el nombre lo da el LMS (opts.studentName), así que se omite
  // la pantalla de identificación y la entrega cifrada/enlace de entrega.
  const scormMode = Boolean(opts.onGraded);
  const scormStudent = opts.studentName || '';
  const storageKey = 'workpdf:al:' + manifest.id;

  const urls = new Map();
  function fileUrl(path) {
    if (!urls.has(path)) {
      const blob = files.get(path);
      if (!blob) return null;
      urls.set(path, URL.createObjectURL(blob));
    }
    return urls.get(path);
  }

  // La grabación de voz incrusta el audio (base64) en la entrega: por su tamaño,
  // la compartición por enlace queda deshabilitada (se entrega por archivo).
  const hasRecordFields = manifest.pages.some(p => p.fields.some(f => f.type === 'record'));
  // Tope holgado para el enlace de entrega: muy por debajo del límite real de
  // Firefox (~65 536) y de Chrome (~2 MB). Por encima, solo descarga de archivo.
  const MAX_SHARE_URL = 16000;

  // Paquetes servidos por el Service Worker: SCORM y webs incrustadas (.zip/.elpx).
  const needsPkgHost = manifest.pages.some(p => p.fields.some(f =>
    f.type === 'scorm' || (f.type === 'embed' && (f.config?.mode === 'zip' || f.config?.mode === 'elpx'))));
  const pkgReady = needsPkgHost && scormSupported() ? registerScormSw() : Promise.resolve(false);

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
        correctionShown: datos.correctionShown || false,
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
    lastEntrega: state?.lastEntrega || null,
    correctionShown: state?.correctionShown || false
  };

  // Para el autoguardado: los campos pesados (grabación de voz) exponen
  // getSaveAnswer() para no persistir el audio en localStorage (cuota ~5 MB).
  function collectAnswers() {
    const out = {};
    controllers.forEach(c => { out[c.field.id] = c.getSaveAnswer ? c.getSaveAnswer() : c.getAnswer(); });
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
    // En SCORM el LMS gestiona acceso e intentos: se entra directo a la actividad.
    if (scormMode) { startActivity(scormStudent, ''); return; }

    const st = accessState();
    if (st === 'before') { showNotYet(); return; }
    if (st === 'after') { showClosed(); return; }

    if (datos.correctionShown || attemptsLeft() <= 0) { showBlocked(); return; }

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
        el('h1', {}, manifest.title || 'OpenWorksheets'),
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
        last
          ? el('p', {}, settings.showScore !== false
              ? t('player.lastScore', { nota: formatNum(last.nota), total: formatNum(last.total) })
              : null)
          : null,
        last ? el('div', { class: 'acciones', style: 'justify-content:center;margin-top:10px' },
          iconBtn({ class: 'btn', onclick: () => downloadEntrega(last, { alumno: last.alumno || datos.alumno, titulo: last.titulo || manifest.title, fecha: last.fecha }) }, ICONS.download, t('player.downloadBtn')),
          last.shareUrl ? iconBtn({ class: 'btn', onclick: () => copyToClipboard(last.shareUrl).then(ok => toast(ok ? t('toast.shareUrlCopied') : t('toast.shareUrlError'), ok ? 'ok' : 'error')) }, ICONS.share, t('player.shareBtn')) : null,
          iconBtn({ class: 'btn', disabled: settings.showScore === false || null, onclick: () => copyResumen(last) }, ICONS.copy, t('player.copyBtn'))) : null)));
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
    doc.style.setProperty('--ficha-font', fontStack(settings.fontFamily));

    doc.appendChild(el('div', { class: 'al-cabecera' },
      el('h1', {}, manifest.title || 'OpenWorksheets'),
      el('span', { class: 'quien' },
        preview ? t('player.previewLabel') : `${alumno}${grupo ? ' · ' + grupo : ''}`)));

    if (manifest.instructions) {
      doc.appendChild(el('div', { class: 'al-instrucciones' }, manifest.instructions));
    }

    const ctx = {
      rng,
      shuffle: Boolean(settings.shuffle),
      onChange: () => { updateProgress(); scheduleSave(); },
      fileUrl,
      pkgHost: needsPkgHost ? {
        supported: scormSupported(),
        ready: pkgReady,
        // Token estable por campo: al reintentar se reescribe la misma caché.
        token: f => `${manifest.id}-${f.id}`,
        provision: (token, pkg) => provisionScormPackage(token, files, pkg),
        runBase: scormRunBase,
        studentName: datos.alumno || ''
      } : null
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
    const detalleCorreccion = [];
    let earned = 0;
    const showCorrection = settings.showCorrection !== false;
    const gradeResults = [];
    controllers.forEach(c => {
      const ans = c.getAnswer();
      const res = gradeField(c.field, ans);
      earned += res.earned;
      c.setDisabled(true);
      const exp = expectedText(c.field);
      gradeResults.push({ c, res, exp });
      // Texto legible de la respuesta. Se calcula para todo campo salvo la
      // grabación de voz (que se muestra como audio). Se incluye aunque sea
      // vacío: así el verificador muestra «—» en blanco en vez de caer al
      // volcado crudo, que en respuestas con IDs (dragdrop, textboxes) los
      // dejaría a la vista.
      const ansTxt = c.field.type === 'record' ? null : answerText(c.field, ans);
      resultados.push({
        id: c.field.id,
        type: c.field.type,
        page: c.pageIndex + 1,
        answer: ans,
        ...(ansTxt !== null ? { answerText: ansTxt } : {}),
        earned: res.earned,
        max: res.max,
        ok: res.ok
      });
    });
    earned = Math.round(earned * 100) / 100;

    const entrega = await buildEntregaData({
      manifest,
      alumno: datos.alumno,
      grupo: datos.grupo,
      resultados,
      earned,
      total: totalPoints
    });
    // En SCORM la entrega la registra el LMS: no se cifra ni se genera archivo.
    const entregaArchivo = scormMode ? null : await encryptSubmission(entrega, manifest.submissionCrypto);

    // Enlace de entrega (opción A+B): se deshabilita si la ficha tiene grabación
    // de voz o si la URL resultante supera el tope holgado. En esos casos solo
    // queda la descarga del archivo, que sí contiene el audio.
    let shareUrl = '';
    if (!scormMode && opts.shareLink !== false) {
      try {
        const encoded = await compressToBase64url(entregaArchivo);
        const u = new URL('./index.html', window.location.href);
        u.hash = 'e=' + encoded;
        if (!hasRecordFields && u.href.length <= MAX_SHARE_URL) shareUrl = u.href;
      } catch {}
    }

    // Reporta la nota al LMS (normalización a 0–100 la hace el envoltorio SCORM).
    // onGraded devuelve si el LMS recibió la nota (false si se abre fuera de un LMS).
    let scormReported = false;
    if (scormMode) scormReported = opts.onGraded({ earned, total: totalPoints, nota10: entrega.nota10 }) === true;

    if (!preview) {
      datos.attempts += 1;
      datos.startedAt = 0;
      datos.lastEntrega = {
        nota: entrega.nota, total: entrega.total, codigo: entrega.codigo, fecha: entrega.fecha,
        alumno: entrega.alumno, titulo: entrega.titulo, shareUrl
      };
      saveState();
      clearAnswersState();
    }

    function applyCorrection() {
      if (!showCorrection) return;
      gradeResults.forEach(({ c, res, exp }) => {
        c.mark(res, exp);
        const ans = c.getAnswer();
        detalleCorreccion.push({ answer: ans, texto: answerText(c.field, ans), ok: res.ok, expected: exp });
      });
      doc.classList.add('al-show-correction');
      const hint = tarjeta.querySelector('.al-correction-hint');
      if (hint) hint.hidden = false;
    }

    function doRetry() {
      if (!preview && accessState() === 'after') { showClosed(); return; }
      datos.seed = (Math.random() * 2 ** 31) | 0;
      datos.startedAt = 0;
      state = null;
      if (!preview) saveState();
      startActivity(datos.alumno, datos.grupo);
      window.scrollTo({ top: 0 });
    }

    // Tarjeta de resultados
    const nota10 = entrega.nota10;
    const showScore = settings.showScore !== false;
    const canRetry = !datos.correctionShown && (preview || attemptsLeft() > 0);

    const hasPending = gradeResults.some(g => g.res.ok === 'pending');

    const acciones = el('div', { class: 'acciones' });
    if (!scormMode) {
      acciones.appendChild(iconBtn({ class: 'btn dark', onclick: () => downloadEntrega(entregaArchivo, entrega) }, ICONS.download, t('player.downloadBtn')));
      if (shareUrl) {
        acciones.appendChild(iconBtn({ class: 'btn', onclick: () => copyShareUrl(shareUrl) }, ICONS.share, t('player.shareBtn')));
      }
    }
    const copyBtn = iconBtn({ class: 'btn', onclick: () => copyResumen(entrega, detalleCorreccion) }, ICONS.copy, t('player.copyBtn'));
    const printBtn = el('button', { class: 'btn', onclick: () => window.print() }, t('player.printBtn'));
    if (!showScore) { copyBtn.disabled = true; printBtn.disabled = true; }
    acciones.appendChild(copyBtn);
    acciones.appendChild(printBtn);

    const tarjeta = el('div', { class: 'al-resultado anim-in' },
      el('h2', {}, preview ? t('player.resultTitlePreview') : t('player.resultTitle')),
      showScore
        ? el('div', { class: 'notaza' + (totalPoints > 0 && entrega.nota / totalPoints >= 0.5 ? ' bien' : '') },
            `${formatNum(entrega.nota)} / ${formatNum(entrega.total)}`)
        : (() => { const p = el('p'); p.innerHTML = t('player.teacherCheck'); return p; })(),
      showScore ? el('div', { class: 'detalle' }, t('player.equiv', { nota: formatNum(nota10) })) : null,
      el('div', { class: 'detalle' },
        `${datos.alumno}${datos.grupo ? ' · ' + datos.grupo : ''} · ${fechaHora(new Date(entrega.fecha))}`),
      scormMode
        ? el('p', { class: 'al-info', style: 'margin-top:12px;font-weight:700;color:' + (scormReported ? 'var(--verde)' : 'var(--rojo)') },
            t(scormReported ? 'player.scormSent' : 'player.scormNotSent'))
        : (() => { const p = el('p', { class: 'al-info', style: 'margin-top:12px' }); p.innerHTML = t('player.submissionInfo'); return p; })(),
      hasPending ? el('p', { class: 'al-info al-pending-hint', style: 'margin-top:8px' }, t('player.pendingReview')) : null,
      (!preview && !scormMode && !shareUrl) ? el('p', { class: 'al-info', style: 'margin-top:8px' }, t('player.shareDisabled')) : null,
      showCorrection ? el('p', { class: 'al-correction-hint al-info', style: 'margin-top:8px', hidden: canRetry }, t('player.correctionHint')) : null,
      acciones);

    if (showScore && totalPoints > 0) {
      const pct = Math.round(entrega.nota / totalPoints * 100);
      tarjeta.querySelector('.detalle').append(t('player.pct', { pct }));
    }

    if (canRetry && showCorrection) {
      const pregunta = el('div', { class: 'al-retry-question' },
        el('p', {}, t('player.retryQuestion')),
        el('div', { class: 'acciones' },
          iconBtn({ class: 'btn', onclick: () => doRetry() }, ICONS.rotateCcw, t('player.retryYes')),
          el('button', { class: 'btn', onclick: () => {
            datos.correctionShown = true;
            const max = Number(settings.maxAttempts) || 0;
            if (max > 0 && datos.attempts < max) datos.attempts = max;
            if (!preview) saveState();
            pregunta.remove();
            applyCorrection();
          }}, t('player.retryNo'))));
      tarjeta.appendChild(pregunta);
    } else if (canRetry) {
      acciones.appendChild(iconBtn({ class: 'btn', onclick: () => doRetry() }, ICONS.rotateCcw, t('player.retryBtn')));
    } else {
      applyCorrection();
    }

    doc.insertBefore(tarjeta, doc.firstChild);
    doc.classList.add('al-entregado');
    barra.remove();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function downloadEntrega(entrega, meta) {
    const blob = new Blob([JSON.stringify(entrega, null, 2)], { type: 'application/json' });
    downloadBlob(blob, entregaFilename(entrega, meta));
  }

  async function copyShareUrl(url) {
    const ok = await copyToClipboard(url);
    toast(ok ? t('toast.shareUrlCopied') : t('toast.shareUrlError'), ok ? 'ok' : 'error');
  }

  async function copyResumen(entrega, detalle = []) {
    const ok = await copyToClipboard(entregaResumen(entrega, { includeScore: settings.showScore !== false, detail: detalle }));
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
